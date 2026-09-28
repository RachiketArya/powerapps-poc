import { randomUUID } from "node:crypto";
import type { Db } from "../kernel/db.js";
import {
  DecisionError,
  decide,
  recordCreatedEvent,
  scopeAllows,
  type Actor,
  type DecidableRecord,
  type DecisionAction,
} from "../kernel/decision-service.js";
import { getWorkflow } from "./index.js";

export interface RefundRequestRow extends DecidableRecord {
  payment_id: string;
  amount_cents: number;
  reason: string;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
}

export interface PaymentRow {
  id: string;
  reference: string;
  customer_label: string;
  amount_cents: number;
  currency: string;
  captured_at: string;
}

/**
 * Remaining refundable balance = captured amount minus everything already
 * approved for execution on that payment. Pending requests do not reserve
 * balance; the reservation check is re-run inside the decision transaction.
 */
export function remainingRefundableCents(db: Db, paymentId: string): number {
  const payment = db.prepare(`SELECT amount_cents FROM payments WHERE id = ?`).get(paymentId) as
    | { amount_cents: number }
    | undefined;
  if (!payment) throw new DecisionError("not_found", "Payment not found", 404);
  const approved = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
         FROM refund_requests
        WHERE payment_id = ? AND status = 'approved_for_execution'`,
    )
    .get(paymentId) as { total: number };
  return payment.amount_cents - approved.total;
}

export function listRefunds(
  db: Db,
  actor: Actor,
  opts: { status?: string; q?: string },
): ReturnType<typeof shapeRow>[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (actor.scope !== "*") {
    clauses.push(`r.scope = ?`);
    params.push(actor.scope);
  }
  if (opts.status && opts.status !== "all") {
    clauses.push(`r.status = ?`);
    params.push(opts.status);
  }
  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    clauses.push(
      `(LOWER(r.id) LIKE ? OR LOWER(r.reason) LIKE ? OR LOWER(p.reference) LIKE ? OR LOWER(p.customer_label) LIKE ?)`,
    );
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT r.*, p.reference, p.customer_label, p.amount_cents AS payment_amount_cents,
              p.currency, p.captured_at,
              ru.display_name AS requester_name, du.display_name AS decider_name
         FROM refund_requests r
         JOIN payments p ON p.id = r.payment_id
         JOIN users ru ON ru.id = r.requested_by
         LEFT JOIN users du ON du.id = r.decided_by
         ${where}
         ORDER BY r.created_at DESC`,
    )
    .all(...params) as Array<Record<string, never>>;
  return rows.map((row) => shapeRow(row));
}

export function getRefund(db: Db, id: string, actor: Actor) {
  const row = db
    .prepare(
      `SELECT r.*, p.reference, p.customer_label, p.amount_cents AS payment_amount_cents,
              p.currency, p.captured_at,
              ru.display_name AS requester_name, du.display_name AS decider_name
         FROM refund_requests r
         JOIN payments p ON p.id = r.payment_id
         JOIN users ru ON ru.id = r.requested_by
         LEFT JOIN users du ON du.id = r.decided_by
        WHERE r.id = ?`,
    )
    .get(id) as Record<string, never> | undefined;
  if (!row || !scopeAllows(actor, (row as unknown as RefundRequestRow).scope)) return undefined;
  const shaped = shapeRow(row);
  const events = db
    .prepare(
      `SELECT e.*, u.display_name AS actor_name
         FROM decision_events e
         JOIN users u ON u.id = e.actor_id
        WHERE e.entity_type = 'refund_request' AND e.entity_id = ?
        ORDER BY e.created_at ASC, e.rowid ASC`,
    )
    .all(id);
  return {
    ...shaped,
    remaining_refundable_cents: remainingRefundableCents(db, shaped.payment_id),
    events,
  };
}

function shapeRow(row: Record<string, never>) {
  const r = row as unknown as RefundRequestRow & Record<string, unknown>;
  return {
    id: r.id,
    payment_id: r.payment_id,
    amount_cents: r.amount_cents,
    reason: r.reason,
    status: r.status,
    version: r.version,
    requested_by: r.requested_by,
    requester_name: row["requester_name"] as unknown as string,
    created_at: r.created_at,
    decided_by: r.decided_by,
    decider_name: (row["decider_name"] as unknown as string) ?? null,
    decided_at: r.decided_at,
    decision_reason: r.decision_reason,
    scope: r.scope,
    // The adapter answers in the registry's field vocabulary, flat, so a
    // definition selecting `payment_reference` gets a value instead of a
    // nested object the surface would have to know how to unpack. Payment
    // details appear once, under these names only.
    payment_reference: row["reference"] as unknown as string,
    customer_label: row["customer_label"] as unknown as string,
    payment_amount_cents: row["payment_amount_cents"] as unknown as number,
    payment_currency: row["currency"] as unknown as string,
    payment_captured_at: row["captured_at"] as unknown as string,
  };
}

export class ValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function createRefundRequest(
  db: Db,
  actor: Actor,
  input: { paymentId: string; amountCents: number; reason: string },
): RefundRequestRow {
  if (actor.role === "viewer") {
    throw new ValidationError("forbidden_role", "Viewers may not create refund requests", 403);
  }
  if (!actor.scope || actor.scope === "*") {
    // Business records are raised inside a team scope. Platform oversight
    // reads everywhere but owns no queue, and a malformed empty scope fails
    // closed.
    throw new ValidationError("forbidden_role", "Only a scoped business actor may create refund requests", 403);
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new ValidationError("invalid_amount", "Amount must be a positive integer number of cents");
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < 5) {
    throw new ValidationError("reason_required", "A reason of at least 5 characters is required");
  }

  const tx = db.transaction(() => {
    const payment = db.prepare(`SELECT scope FROM payments WHERE id = ?`).get(input.paymentId) as
      | { scope: string }
      | undefined;
    if (!payment || !scopeAllows(actor, payment.scope)) {
      throw new ValidationError("not_found", "Payment not found", 404);
    }
    const remaining = remainingRefundableCents(db, input.paymentId);
    if (input.amountCents > remaining) {
      throw new ValidationError(
        "exceeds_remaining_balance",
        `Amount exceeds the remaining refundable balance of ${remaining} cents`,
      );
    }
    // The record belongs to the payment's scope, not whatever the caller's
    // own scope happens to be — an actor may only reach a payment inside
    // their scope, so the record can never land in the wrong team's queue.
    const scope = payment.scope;
    const id = `rr_${randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO refund_requests
         (id, payment_id, amount_cents, reason, status, version, requested_by, created_at, scope)
       VALUES (?, ?, ?, ?, 'pending', 1, ?, ?, ?)`,
    ).run(id, input.paymentId, input.amountCents, reason, actor.id, createdAt, scope);
    recordCreatedEvent({
      db,
      entityType: "refund_request",
      entityId: id,
      actor,
      reason,
      detail: { amount_cents: input.amountCents, payment_id: input.paymentId },
      createdAt,
    });
    return db.prepare(`SELECT * FROM refund_requests WHERE id = ?`).get(id) as RefundRequestRow;
  });
  return (tx as unknown as { immediate: () => RefundRequestRow }).immediate();
}

export function decideRefund(
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
  return decide<RefundRequestRow>({
    db,
    table: "refund_requests",
    entityType: "refund_request",
    entityId: args.id,
    actor,
    // Read from the registry at decision time: the registry is the single
    // source of truth for who may decide, for the API as well as the UI.
    decisionRoles: getWorkflow("refund_review")!.decisionRoles,
    action: args.action,
    reason: args.reason,
    expectedVersion: args.expectedVersion,
    idempotencyKey: args.idempotencyKey,
    onAuditWrite: args.onAuditWrite,
    validate: (record, ctx) => {
      if (ctx.action !== "approve") return;
      // Re-checked and reserved inside the decision transaction so that two
      // requests against the same payment cannot both be approved past the
      // remaining balance.
      const remaining = remainingRefundableCents(ctx.db, record.payment_id);
      if (record.amount_cents > remaining) {
        throw new DecisionError(
          "domain_rule",
          `Approving ${record.amount_cents} cents would exceed the remaining refundable balance of ${remaining} cents for this payment`,
          409,
        );
      }
    },
    detail: (record) => ({
      amount_cents: record.amount_cents,
      payment_id: record.payment_id,
      execution: "none — approval only marks the request approved for execution",
    }),
  });
}
