import { randomUUID } from "node:crypto";
import type { Db } from "../kernel/db.js";
import {
  DecisionError,
  assertReasonLength,
  decide,
  recordCreatedEvent,
  scopeAllows,
  type Actor,
  type DecidableRecord,
  type DecisionAction,
} from "../kernel/decision-service.js";
import { ValidationError } from "./refund-review.js";
import { getWorkflow } from "./index.js";

/**
 * Second queue on the SAME shared decision service. Everything generic
 * (roles, separation of duties, reasons, transitions, versions, idempotency,
 * atomic state+audit) is inherited; only the validation below is new.
 *
 * Nothing here updates any bank record. Approval labels the change
 * "approved for execution" and stops.
 */

export interface VendorBankChangeRow extends DecidableRecord {
  vendor_name: string;
  current_masked_ref: string;
  new_masked_ref: string;
  country: string;
  verification_channel: VerificationChannel;
  reason: string;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
}

export type VerificationChannel = "callback_to_known_number" | "inbound_email_only" | "portal_message";

const VERIFICATION_CHANNELS: VerificationChannel[] = [
  "callback_to_known_number",
  "inbound_email_only",
  "portal_message",
];

/** Synthetic masked reference: exactly four visible trailing digits. */
const MASKED_REF = /^[•*]{4}-[•*]{4}-\d{4}$/u;

const ALLOWED_COUNTRIES = ["US", "IE", "GB", "DE"];

/** Approving a bank change on an unverifiable channel is refused outright. */
const UNVERIFIABLE_CHANNELS: VerificationChannel[] = ["inbound_email_only"];

const MIN_APPROVAL_REASON_LENGTH = 20;

export function listVendorBankChanges(db: Db, actor: Actor, opts: { status?: string; q?: string }) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (actor.scope !== "*") {
    if (!actor.scope) {
      return [];
    }
    clauses.push(`v.scope = ?`);
    params.push(actor.scope);
  }
  if (opts.status && opts.status !== "all") {
    clauses.push(`v.status = ?`);
    params.push(opts.status);
  }
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    clauses.push(`(LOWER(v.id) LIKE ? OR LOWER(v.vendor_name) LIKE ? OR LOWER(v.reason) LIKE ? OR v.new_masked_ref LIKE ?)`);
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT v.*, ru.display_name AS requester_name, du.display_name AS decider_name
         FROM vendor_bank_changes v
         JOIN users ru ON ru.id = v.requested_by
         LEFT JOIN users du ON du.id = v.decided_by
         ${where}
         ORDER BY v.created_at DESC`,
    )
    .all(...params);
}

export function getVendorBankChange(db: Db, id: string, actor: Actor) {
  const row = db
    .prepare(
      `SELECT v.*, ru.display_name AS requester_name, du.display_name AS decider_name
         FROM vendor_bank_changes v
         JOIN users ru ON ru.id = v.requested_by
         LEFT JOIN users du ON du.id = v.decided_by
        WHERE v.id = ?`,
    )
    .get(id);
  if (!row || !scopeAllows(actor, (row as VendorBankChangeRow).scope)) return undefined;
  const events = db
    .prepare(
      `SELECT e.*, u.display_name AS actor_name
         FROM decision_events e JOIN users u ON u.id = e.actor_id
        WHERE e.entity_type = 'vendor_bank_change' AND e.entity_id = ?
        ORDER BY e.created_at ASC, e.rowid ASC`,
    )
    .all(id);
  return { ...(row as object), events };
}

export function createVendorBankChange(
  db: Db,
  actor: Actor,
  input: {
    vendorName: string;
    currentMaskedRef: string;
    newMaskedRef: string;
    country: string;
    verificationChannel: string;
    reason: string;
  },
): VendorBankChangeRow {
  if (actor.role === "viewer") {
    throw new ValidationError("forbidden_role", "Viewers may not raise vendor bank changes", 403);
  }
  if (!actor.scope || actor.scope === "*") {
    throw new ValidationError("forbidden_role", "Only a scoped business actor may raise vendor bank changes", 403);
  }
  if (!input.vendorName?.trim()) {
    throw new ValidationError("invalid_vendor", "A vendor name is required");
  }
  for (const [field, value] of [
    ["currentMaskedRef", input.currentMaskedRef],
    ["newMaskedRef", input.newMaskedRef],
  ] as const) {
    if (!MASKED_REF.test(value ?? "")) {
      throw new ValidationError(
        "invalid_masked_reference",
        `${field} must be a masked synthetic reference of the form ••••-••••-1234`,
      );
    }
  }
  if (input.currentMaskedRef === input.newMaskedRef) {
    throw new ValidationError("unchanged_account", "The new account reference is identical to the current one");
  }
  if (!ALLOWED_COUNTRIES.includes(input.country)) {
    throw new ValidationError("unsupported_country", `Country must be one of ${ALLOWED_COUNTRIES.join(", ")}`);
  }
  if (!VERIFICATION_CHANNELS.includes(input.verificationChannel as VerificationChannel)) {
    throw new ValidationError("invalid_verification_channel", "Unknown verification channel");
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < 5) {
    throw new ValidationError("reason_required", "A reason of at least 5 characters is required");
  }

  const id = `vbc_${randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO vendor_bank_changes
         (id, vendor_name, current_masked_ref, new_masked_ref, country, verification_channel,
          reason, status, version, requested_by, created_at, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?)`,
    ).run(
      id,
      input.vendorName.trim(),
      input.currentMaskedRef,
      input.newMaskedRef,
      input.country,
      input.verificationChannel,
      reason,
      actor.id,
      createdAt,
      actor.scope === "*" ? "us-ops" : actor.scope,
    );
    recordCreatedEvent({
      db,
      entityType: "vendor_bank_change",
      entityId: id,
      actor,
      reason,
      detail: { new_masked_ref: input.newMaskedRef, verification_channel: input.verificationChannel },
      createdAt,
    });
    return db.prepare(`SELECT * FROM vendor_bank_changes WHERE id = ?`).get(id) as VendorBankChangeRow;
  });
  return (tx as unknown as { immediate: () => VendorBankChangeRow }).immediate();
}

export function decideVendorBankChange(
  db: Db,
  actor: Actor,
  args: {
    id: string;
    action: DecisionAction;
    reason: string;
    expectedVersion: number;
    idempotencyKey?: string;
    onAuditWrite?: () => void;
  },
) {
  return decide<VendorBankChangeRow>({
    db,
    table: "vendor_bank_changes",
    entityType: "vendor_bank_change",
    entityId: args.id,
    actor,
    // Read from the registry at decision time: the registry is the single
    // source of truth for who may decide, for the API as well as the UI.
    decisionRoles: getWorkflow("vendor_bank_change_review")!.decisionRoles,
    action: args.action,
    reason: args.reason,
    expectedVersion: args.expectedVersion,
    idempotencyKey: args.idempotencyKey,
    onAuditWrite: args.onAuditWrite,
    validate: (record, ctx) => {
      if (ctx.action !== "approve") return;
      if (UNVERIFIABLE_CHANNELS.includes(record.verification_channel)) {
        throw new DecisionError(
          "domain_rule",
          "This change was requested over an unverifiable channel (inbound email only) and cannot be approved. Re-verify by callback to a previously known number.",
          409,
        );
      }
      assertReasonLength(
        args.reason,
        MIN_APPROVAL_REASON_LENGTH,
        `Approving a bank change requires at least ${MIN_APPROVAL_REASON_LENGTH} characters describing the independent verification performed`,
        "domain_rule",
      );
    },
    detail: (record) => ({
      vendor_name: record.vendor_name,
      new_masked_ref: record.new_masked_ref,
      verification_channel: record.verification_channel,
      execution: "none — no bank record is updated by this system",
    }),
  });
}
