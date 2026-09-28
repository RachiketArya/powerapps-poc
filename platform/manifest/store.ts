/**
 * Promotion and load path for app definitions — platform-owned, trusted code.
 *
 * Promotion is the only way a definition reaches the catalog, it requires the
 * platform-admin role, and it writes the definition and its audit event in one
 * transaction. Loading is defensive: the file on disk is re-parsed,
 * digest-checked and re-validated every time, so editing it by hand (or
 * bypassing the workshop entirely) quarantines the app instead of activating
 * unchecked content.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../kernel/db.js";
import type { Actor } from "../kernel/decision-service.js";
import { digestOf, validateDefinition, type AppDefinition, type Violation } from "./schema.js";

export class PromotionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    readonly violations: Violation[] = [],
  ) {
    super(message);
  }
}

export function activeAppsDir(): string {
  return process.env.CONTROL_ROOM_APPS_DIR ?? path.resolve(process.cwd(), "data/active-apps");
}

export interface CatalogEntry {
  appId: string;
  version: number;
  digest: string;
  sourcePath: string | null;
  promotedBy: string;
  promotedAt: string;
  /** `active` apps are served; `quarantined` apps are listed but refuse to run. */
  status: "active" | "quarantined";
  definition: AppDefinition | null;
  findings: Violation[];
}

function recordEvent(
  db: Db,
  event: {
    type: string;
    appId?: string | null;
    version?: number | null;
    digest?: string | null;
    actor: Actor;
    outcome: "allowed" | "denied";
    detail?: unknown;
  },
): void {
  db.prepare(
    `INSERT INTO platform_events (id, event_type, app_id, app_version, digest, actor_id, actor_role, outcome, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    event.type,
    event.appId ?? null,
    event.version ?? null,
    event.digest ?? null,
    event.actor.id,
    event.actor.role,
    event.outcome,
    event.detail === undefined ? null : JSON.stringify(event.detail),
    new Date().toISOString(),
  );
}

/**
 * Promote a definition into the local catalog. Denials are audited too, so an
 * attempt by a maker to promote is visible in Activity.
 */
export function promoteDefinition(db: Db, actor: Actor, input: unknown): CatalogEntry {
  if (actor.role !== "platform_admin") {
    recordEvent(db, {
      type: "app.promote",
      actor,
      outcome: "denied",
      detail: { reason: "role_not_permitted" },
    });
    throw new PromotionError(
      "forbidden_role",
      `Role '${actor.role}' may draft and validate a definition but may not promote it. Promotion is platform-admin only.`,
      403,
    );
  }

  const outcome = validateDefinition(input);
  if (!outcome.ok || !outcome.definition || !outcome.digest) {
    recordEvent(db, {
      type: "app.promote",
      actor,
      outcome: "denied",
      detail: { reason: "validation_failed", violations: outcome.violations },
    });
    throw new PromotionError(
      "definition_rejected",
      "The definition was refused by the platform validator and was not promoted.",
      422,
      outcome.violations,
    );
  }

  const definition = outcome.definition;
  const digest = outcome.digest;
  const previous = db
    .prepare(`SELECT MAX(version) AS v FROM app_definitions WHERE app_id = ?`)
    .get(definition.appId) as { v: number | null };
  const version = (previous.v ?? 0) + 1;
  const dir = activeAppsDir();
  const file = path.join(dir, `${definition.appId}.app.json`);
  const promotedAt = new Date().toISOString();
  const body = `${JSON.stringify(definition, null, 2)}\n`;

  const run = db.transaction(() => {
    db.prepare(`UPDATE app_definitions SET active = 0 WHERE app_id = ?`).run(definition.appId);
    db.prepare(
      `INSERT INTO app_definitions (app_id, version, digest, definition_json, source_path, active, promoted_by, promoted_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(definition.appId, version, digest, JSON.stringify(definition), file, actor.id, promotedAt);
    recordEvent(db, {
      type: "app.promote",
      appId: definition.appId,
      version,
      digest,
      actor,
      outcome: "allowed",
      detail: { workflow: definition.workflow, capabilities: definition.capabilities },
    });
    // Written inside the transaction so a failed disk write rolls the catalog
    // row and its audit event back together.
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, body, "utf8");
  });
  run();

  return {
    appId: definition.appId,
    version,
    digest,
    sourcePath: file,
    promotedBy: actor.id,
    promotedAt,
    status: "active",
    definition,
    findings: [],
  };
}

interface Row {
  app_id: string;
  version: number;
  digest: string;
  definition_json: string;
  source_path: string | null;
  promoted_by: string;
  promoted_at: string;
}

/**
 * Load the catalog. Every entry is re-validated on the way out; the on-disk
 * copy wins as the thing actually being read, which is what makes hand-editing
 * it detectable rather than effective.
 */
export function loadCatalog(db: Db): CatalogEntry[] {
  const rows = db
    .prepare(`SELECT * FROM app_definitions WHERE active = 1 ORDER BY app_id`)
    .all() as Row[];
  return rows.map((row) => revalidate(row));
}

export function loadApp(db: Db, appId: string): CatalogEntry | null {
  const row = db.prepare(`SELECT * FROM app_definitions WHERE app_id = ? AND active = 1`).get(appId) as
    | Row
    | undefined;
  return row ? revalidate(row) : null;
}

function revalidate(row: Row): CatalogEntry {
  const base = {
    appId: row.app_id,
    version: row.version,
    digest: row.digest,
    sourcePath: row.source_path,
    promotedBy: row.promoted_by,
    promotedAt: row.promoted_at,
  };
  const findings: Violation[] = [];

  let raw: unknown;
  if (row.source_path && fs.existsSync(row.source_path)) {
    try {
      raw = JSON.parse(fs.readFileSync(row.source_path, "utf8"));
    } catch {
      findings.push({
        code: "definition_unparsable",
        path: row.source_path,
        message: "The promoted definition file is not valid JSON",
        policy: "active definitions are re-read and re-validated on every load",
        nextAction: "Re-promote the app through the workshop; the file was changed outside the release path.",
      });
      return { ...base, status: "quarantined", definition: null, findings };
    }
  } else {
    raw = JSON.parse(row.definition_json);
    findings.push({
      code: "definition_file_missing",
      path: row.source_path ?? "(no path)",
      message: "The promoted file is missing; the catalog copy was used for this check",
      policy: "active definitions are re-read and re-validated on every load",
      nextAction: "Re-promote the app to restore the released file.",
    });
  }

  const onDiskDigest = digestOf(raw);
  if (onDiskDigest !== row.digest) {
    findings.push({
      code: "digest_mismatch",
      path: row.source_path ?? "(no path)",
      message: `The definition on disk (${onDiskDigest}) does not match the promoted digest (${row.digest})`,
      policy: "only a digest that was recorded at promotion time may run",
      nextAction: "Re-promote through the workshop so the change is validated and audited.",
    });
  }

  const outcome = validateDefinition(raw);
  findings.push(...outcome.violations);

  if (findings.length > 0 || !outcome.definition) {
    return { ...base, status: "quarantined", definition: null, findings };
  }
  return { ...base, status: "active", definition: outcome.definition, findings: [] };
}

export function platformEvents(db: Db, limit = 50) {
  return db
    .prepare(
      `SELECT id, event_type, app_id, app_version, digest, actor_id, actor_role, outcome, detail_json, created_at
         FROM platform_events ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(limit);
}
