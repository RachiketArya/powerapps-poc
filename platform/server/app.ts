/**
 * Control Room HTTP surface — platform-owned, trusted code.
 *
 * Every route resolves the actor from the demo session cookie; actor/role
 * fields in a request body are never read. App definitions influence *labels,
 * field selection and which of the workflow's capabilities are offered* and
 * nothing else: the business rules below come from the registry and the
 * shared decision kernel.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { z } from "zod";
import type { Db } from "../kernel/db.js";
import { DecisionError, type Actor } from "../kernel/decision-service.js";
import {
  ValidationError,
  createRefundRequest,
  decideRefund,
  getRefund,
  listRefunds,
  remainingRefundableCents,
} from "../registry/refund-review.js";
import {
  createVendorBankChange,
  decideVendorBankChange,
  getVendorBankChange,
  listVendorBankChanges,
} from "../registry/vendor-bank-change-review.js";
import { APPROVED_CONNECTORS, allWorkflows, getWorkflow } from "../registry/index.js";
import { PORTFOLIO } from "../portfolio.js";
import { validateDefinition } from "../manifest/schema.js";
import {
  PromotionError,
  loadApp,
  loadCatalog,
  platformEvents,
  promoteDefinition,
  type CatalogEntry,
} from "../manifest/store.js";

export const DEMO_SESSION_COOKIE = "control_room_demo_session";

declare module "express-serve-static-core" {
  interface Request {
    actor?: Actor;
    app_entry?: CatalogEntry;
  }
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function createApp(db: Db) {
  const app = express();
  app.use(express.json({ limit: "128kb" }));
  app.use(cookieParser());

  app.use((req, _res, next) => {
    const token = req.cookies?.[DEMO_SESSION_COOKIE];
    if (typeof token === "string") {
      const row = db
        .prepare(
          `SELECT u.id, u.role, u.display_name, u.scope
             FROM demo_sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = ?`,
        )
        .get(token) as { id: string; role: Actor["role"]; display_name: string; scope: string } | undefined;
      // The actor is resolved here and nowhere else. Any actor/role fields in a
      // request body are ignored by every handler below.
      if (row) req.actor = { id: row.id, role: row.role, displayName: row.display_name, scope: row.scope };
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      mode: "demo",
      authentication: "mock demo-session cookie, not SSO",
      executes_payments: false,
    });
  });

  app.get("/api/demo-users", (_req, res) => {
    const users = db.prepare(`SELECT id, display_name, role, team, scope FROM users ORDER BY role, id`).all();
    res.json({
      users,
      notice: "Demo identity selector. This is NOT authentication and grants no real access.",
    });
  });

  app.post("/api/session", (req, res) => {
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_body", message: "userId is required" });
    const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(parsed.data.userId);
    if (!user) return res.status(404).json({ error: "unknown_user", message: "Unknown demo user" });
    const token = randomUUID();
    db.prepare(`INSERT INTO demo_sessions (token, user_id, created_at) VALUES (?, ?, ?)`).run(
      token,
      parsed.data.userId,
      new Date().toISOString(),
    );
    res.cookie(DEMO_SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax" });
    return res.json({ ok: true });
  });

  app.delete("/api/session", (req, res) => {
    const token = req.cookies?.[DEMO_SESSION_COOKIE];
    if (typeof token === "string") db.prepare(`DELETE FROM demo_sessions WHERE token = ?`).run(token);
    res.clearCookie(DEMO_SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.get("/api/me", (req, res) => {
    if (!req.actor) return res.status(401).json({ error: "unauthenticated", message: "No demo session" });
    return res.json({
      actor: req.actor,
      simulated: true,
      notice: "Simulated demo identity — resolved server-side from the demo session cookie. Not SSO.",
    });
  });

  app.use("/api", requireSession);

  // ---------------------------------------------------------------- platform

  app.get("/api/portfolio", (_req, res) => {
    res.json({
      entries: PORTFOLIO,
      notice:
        "Runnable means a promoted definition exists in this runtime. Planned entries are roadmap only — no code, telemetry or test counts are implied. Owners are proposed roles, not real teams.",
    });
  });

  app.get("/api/platform/registry", (_req, res) => {
    res.json({
      connectors: APPROVED_CONNECTORS,
      workflows: allWorkflows().map((w) => ({
        key: w.key,
        title: w.title,
        entityType: w.entityType,
        approvedConnectorIds: w.approvedConnectorIds,
        capabilityCeiling: w.capabilityCeiling,
        decisionRoles: w.decisionRoles,
        listFields: w.listFields,
        detailFields: w.detailFields,
        nonNegotiableControls: w.nonNegotiableControls,
      })),
      notice:
        "Ceilings, connectors and controls are platform-owned. An app definition selects a subset and can never extend them.",
    });
  });

  app.get("/api/catalog", (_req, res) => {
    res.json({ apps: loadCatalog(db).map(publicEntry) });
  });

  app.get("/api/catalog/:appId", (req, res) => {
    const entry = loadApp(db, req.params.appId);
    if (!entry) return res.status(404).json({ error: "not_found", message: "No such app in the local catalog" });
    return res.json({ app: publicEntry(entry) });
  });

  // Platform oversight. This is deliberately cross-app, so it is restricted to
  // the platform admin rather than offered to every session: an app's capability
  // set narrows that app's surface, it is not per-user data isolation.
  app.get("/api/activity", (req, res) => {
    if (req.actor!.role !== "platform_admin") {
      return res.status(403).json({
        error: "forbidden_role",
        message:
          "Cross-app activity is platform oversight and is limited to the platform admin. Per-record history is available inside an app that requests 'audit.read'.",
      });
    }
    const platform = platformEvents(db, 60);
    const decisions = db
      .prepare(
        `SELECT e.id, e.entity_type, e.entity_id, e.action, e.actor_id, e.actor_role, e.reason,
                e.from_status, e.to_status, e.created_at, u.display_name AS actor_name
           FROM decision_events e JOIN users u ON u.id = e.actor_id
          ORDER BY e.created_at DESC, e.rowid DESC LIMIT 60`,
      )
      .all();
    return res.json({ platform, decisions });
  });

  // ---------------------------------------------------------------- workshop

  app.get("/api/workshop/templates", (_req, res) => {
    const read = (dir: string, file: string) => {
      const full = path.join(repoRoot(), dir, file);
      return { file, body: JSON.parse(fs.readFileSync(full, "utf8")) as unknown };
    };
    const examplesDir = path.join(repoRoot(), "apps", "examples");
    const examples = fs.existsSync(examplesDir) ? fs.readdirSync(examplesDir).filter((f) => f.endsWith(".json")).sort() : [];
    res.json({
      templates: ["refund-review.app.json", "vendor-bank-change-review.app.json"].map((f) => read("apps", f)),
      unsafeExamples: examples.map((f) => read("apps/examples", f)),
      notice:
        "Describe the app you want to a coding agent, paste the definition it writes here, and the platform validator decides whether it may be released.",
    });
  });

  app.post("/api/workshop/validate", (req, res) => {
    const outcome = validateDefinition(req.body?.definition);
    res.json({
      ok: outcome.ok,
      digest: outcome.digest ?? null,
      violations: outcome.violations,
      checkedAt: new Date().toISOString(),
    });
  });

  app.post("/api/catalog/promote", (req, res, next) => {
    try {
      const entry = promoteDefinition(db, req.actor!, req.body?.definition);
      return res.status(201).json({
        app: publicEntry(entry),
        note: "Activated locally. This is a local release into this runtime's catalog — nothing is deployed anywhere.",
      });
    } catch (err) {
      return next(err);
    }
  });

  // ------------------------------------------------------------- assurance

  app.get("/api/assurance", (_req, res) => {
    const file = path.join(repoRoot(), "evidence", "test-results.json");
    let run: AssuranceRun | null = null;
    let error: string | null = null;
    if (fs.existsSync(file)) {
      try {
        run = summariseRun(JSON.parse(fs.readFileSync(file, "utf8")) as VitestJson, fs.statSync(file).mtime);
      } catch {
        error = "The recorded test results file could not be parsed. Re-run `npm run assure`.";
      }
    } else {
      error = "No recorded run. Run `npm run assure` to produce evidence/test-results.json.";
    }
    res.json({
      run,
      error,
      revision: revisionBinding(),
      command: "npm run assure",
      invariants: allWorkflows().flatMap((w) => w.nonNegotiableControls.map((c) => ({ workflow: w.key, control: c }))),
      productionGaps: PRODUCTION_GAPS,
    });
  });

  // ------------------------------------------------------------ app runtime

  function withApp(capability: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const entry = loadApp(db, req.params.appId!);
      if (!entry) return res.status(404).json({ error: "not_found", message: "No such app in the local catalog" });
      if (entry.status !== "active" || !entry.definition) {
        return res.status(409).json({
          error: "app_quarantined",
          message:
            "This app's definition failed re-validation on load and will not run. Re-promote it through the workshop.",
          findings: entry.findings,
        });
      }
      if (!entry.definition.capabilities.includes(capability as never)) {
        return res.status(403).json({
          error: "capability_not_granted",
          message: `The app definition does not request '${capability}', so the runtime does not offer it.`,
        });
      }
      req.app_entry = entry;
      return next();
    };
  }

  function entityOf(req: Request) {
    return getWorkflow(req.app_entry!.definition!.workflow)!.entityType;
  }

  /**
   * Record history is only returned to an app that requested `audit.read`.
   * Capability narrowing is enforced on the payload, not by hiding a panel.
   */
  function project(req: Request, record: Record<string, unknown> | undefined) {
    if (!record) return record;
    if (req.app_entry!.definition!.capabilities.includes("audit.read")) return record;
    const { events: _events, ...rest } = record as { events?: unknown };
    return rest;
  }

  // Payment options exist for the refund workflow's creation form only, and
  // only for an app that may create records.
  app.get("/api/apps/:appId/payments", withApp("record.create"), (req, res) => {
    if (entityOf(req) !== "refund_request") {
      return res.status(404).json({ error: "not_found", message: "This workflow has no payment options" });
    }
    const scope = req.actor!.scope;
    const payments = (
      scope === "*"
        ? db.prepare(`SELECT * FROM payments ORDER BY captured_at DESC`).all()
        : scope
          ? db.prepare(`SELECT * FROM payments WHERE scope = ? ORDER BY captured_at DESC`).all(scope)
          : []
    ) as Array<{ id: string }>;
    return res.json({
      payments: payments.map((p) => ({ ...p, remaining_refundable_cents: remainingRefundableCents(db, p.id) })),
    });
  });

  app.get("/api/apps/:appId/records/:id/audit", withApp("audit.read"), (req, res) => {
    const record = (
      entityOf(req) === "refund_request" ? getRefund(db, req.params.id!, req.actor!) : getVendorBankChange(db, req.params.id!, req.actor!)
    ) as { events?: unknown } | undefined;
    if (!record) return res.status(404).json({ error: "not_found", message: "Record not found" });
    return res.json({ events: record.events ?? [] });
  });

  app.get("/api/apps/:appId/records", withApp("queue.read"), (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const records =
      entityOf(req) === "refund_request" ? listRefunds(db, req.actor!, { status, q }) : listVendorBankChanges(db, req.actor!, { status, q });
    res.json({ records });
  });

  app.get("/api/apps/:appId/records/:id", withApp("record.read"), (req, res) => {
    const record =
      entityOf(req) === "refund_request" ? getRefund(db, req.params.id!, req.actor!) : getVendorBankChange(db, req.params.id!, req.actor!);
    if (!record) return res.status(404).json({ error: "not_found", message: "Record not found" });
    return res.json({ record: project(req, record as Record<string, unknown>) });
  });

  const createRefundSchema = z.object({
    paymentId: z.string().min(1),
    amountCents: z.number(),
    reason: z.string(),
  });
  const createVendorSchema = z.object({
    vendorName: z.string(),
    currentMaskedRef: z.string(),
    newMaskedRef: z.string(),
    country: z.string(),
    verificationChannel: z.string(),
    reason: z.string(),
  });

  app.post("/api/apps/:appId/records", withApp("record.create"), (req, res, next) => {
    try {
      if (entityOf(req) === "refund_request") {
        const parsed = createRefundSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(badBody(parsed.error));
        const created = createRefundRequest(db, req.actor!, parsed.data);
        return res.status(201).json({ record: project(req, getRefund(db, created.id, req.actor!) as Record<string, unknown>) });
      }
      const parsed = createVendorSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(badBody(parsed.error));
      const created = createVendorBankChange(db, req.actor!, parsed.data);
      return res
        .status(201)
        .json({ record: project(req, getVendorBankChange(db, created.id, req.actor!) as Record<string, unknown>) });
    } catch (err) {
      return next(err);
    }
  });

  const decisionSchema = z.object({
    decision: z.enum(["approve", "reject"]),
    reason: z.string(),
    expectedVersion: z.number().int(),
    idempotencyKey: z.string().optional(),
  });

  app.post("/api/apps/:appId/records/:id/decision", (req, res, next) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(badBody(parsed.error));
    const capability = parsed.data.decision === "approve" ? "decision.approve" : "decision.reject";
    return withApp(capability)(req, res, () => {
      try {
        const refundWorkflow = entityOf(req) === "refund_request";
        const args = {
          id: req.params.id!,
          action: parsed.data.decision,
          reason: parsed.data.reason,
          expectedVersion: parsed.data.expectedVersion,
          idempotencyKey: parsed.data.idempotencyKey,
        };
        const result = refundWorkflow
          ? decideRefund(db, req.actor!, args)
          : decideVendorBankChange(db, req.actor!, args);
        const approved = result.record.status === "approved_for_execution";
        return res.json({
          record: project(
            req,
            (refundWorkflow
              ? getRefund(db, result.record.id, req.actor!)
              : getVendorBankChange(db, result.record.id, req.actor!)) as Record<string, unknown>,
          ),
          duplicate: result.duplicate,
          note: approved
            ? refundWorkflow
              ? "Marked 'approved for execution'. No refund is executed by this system."
              : "Marked 'approved for execution'. No bank record is updated by this system."
            : refundWorkflow
              ? "Recorded as rejected. Nothing is executed and the record is now closed."
              : "Recorded as rejected. No bank record is updated and the change is now closed.",
        });
      } catch (err) {
        return next(err);
      }
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof PromotionError) {
      return res.status(err.httpStatus).json({ error: err.code, message: err.message, violations: err.violations });
    }
    if (err instanceof DecisionError || err instanceof ValidationError) {
      return res.status(err.httpStatus).json({ error: err.code, message: err.message });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: "internal_error", message: "Unexpected server error" });
  });

  return app;
}

export const PRODUCTION_GAPS = [
  "Identity is a demo cookie. Real SSO, group-derived roles and session lifetime are not implemented.",
  "Approved connectors are in-process readers over synthetic SQLite data. They are not network-isolated integrations.",
  "The audit trail is append-only through the API and written in the same transaction as the state change. It is not tamper-proof storage: anyone with the database file can alter it.",
  "This repository does not enforce the trusted/untrusted split. Branch protection, CODEOWNERS review on platform/, a separately controlled deploy identity and network egress policy are required for that.",
  "Definitions cannot cause network calls, but authoring arbitrary server code is outside the supported model — it is not made safe by these tests.",
  "Automated checks demonstrate the boundary, not business correctness.",
  "Capability narrowing is a per-app surface control, not user data isolation. Two apps on the same workflow read the same records, so a user who may use a broader app still reaches that data through it. Per-app or per-tenant record entitlements are not implemented.",
  "Assurance results are the last recorded run, bound to the source revision it was recorded against. They are a staleness signal, not an attestation that the run happened.",
];

interface RevisionBinding {
  recordedFor: string | null;
  current: string | null;
  uncommittedChangesWhenRecorded: boolean | null;
  stale: boolean | null;
  note: string;
}

/**
 * Binds the recorded run to a source revision. `stale` is true when the
 * checkout has moved on since the run was recorded, so the view can say the
 * results may not describe the code being served.
 */
function revisionBinding(): RevisionBinding {
  const metaFile = path.join(repoRoot(), "evidence", "assurance-meta.json");
  let recordedFor: string | null = null;
  let uncommittedChangesWhenRecorded: boolean | null = null;
  if (fs.existsSync(metaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as {
        revision?: string | null;
        uncommittedChanges?: boolean | null;
      };
      recordedFor = meta.revision ?? null;
      uncommittedChangesWhenRecorded = meta.uncommittedChanges ?? null;
    } catch {
      /* treated as an unbound run below */
    }
  }
  let current: string | null = null;
  try {
    current = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot(), encoding: "utf8" }).trim();
  } catch {
    current = null;
  }
  return {
    recordedFor,
    current,
    uncommittedChangesWhenRecorded,
    stale: recordedFor && current ? recordedFor !== current : null,
    note: "Last recorded run. It describes the revision it was recorded against, which may not be the code running now.",
  };
}

interface VitestJson {
  startTime?: number;
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  testResults?: Array<{
    name: string;
    status: string;
    assertionResults?: Array<{ title: string; fullName?: string; status: string; failureMessages?: string[] }>;
  }>;
}

interface AssuranceRun {
  startedAt: string | null;
  recordedAt: string;
  total: number;
  passed: number;
  failed: number;
  files: Array<{ file: string; status: string; tests: Array<{ title: string; status: string; failure?: string }> }>;
}

/**
 * Reads whatever the last `npm run assure` actually produced. Nothing here is
 * hard-coded: with no run on disk the view says so, and a failing run is
 * reported as failing.
 */
function summariseRun(json: VitestJson, mtime: Date): AssuranceRun {
  const files = (json.testResults ?? []).map((f) => ({
    file: path.relative(repoRoot(), f.name),
    status: f.status,
    tests: (f.assertionResults ?? []).map((t) => ({
      title: t.title,
      status: t.status,
      failure: t.failureMessages?.[0],
    })),
  }));
  return {
    startedAt: json.startTime ? new Date(json.startTime).toISOString() : null,
    recordedAt: mtime.toISOString(),
    total: json.numTotalTests ?? files.reduce((n, f) => n + f.tests.length, 0),
    passed: json.numPassedTests ?? 0,
    failed: json.numFailedTests ?? 0,
    files,
  };
}

function publicEntry(entry: CatalogEntry) {
  return {
    appId: entry.appId,
    version: entry.version,
    digest: entry.digest,
    status: entry.status,
    findings: entry.findings,
    promotedBy: entry.promotedBy,
    promotedAt: entry.promotedAt,
    sourcePath: entry.sourcePath,
    definition: entry.definition,
    workflow: entry.definition ? getWorkflow(entry.definition.workflow) ?? null : null,
  };
}

function badBody(error: z.ZodError) {
  return { error: "invalid_body", message: error.issues[0]?.message ?? "Invalid body" };
}

function requireSession(req: Request, res: Response, next: NextFunction) {
  if (!req.actor) {
    return res.status(401).json({ error: "unauthenticated", message: "Select a demo identity first" });
  }
  return next();
}
