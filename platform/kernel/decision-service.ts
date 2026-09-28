import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Narrow shared decision service.
 *
 * It owns exactly one thing: taking a pending record to a terminal decision
 * state while writing an audit event in the same transaction. Domain-specific
 * validation is supplied by the caller through `validate`; the service itself
 * knows nothing about refunds or vendor bank changes.
 */

export type DecisionAction = "approve" | "reject";
export type DecidableTable = "refund_requests" | "vendor_bank_changes";
export type EntityType = "refund_request" | "vendor_bank_change";
export type RecordStatus = "pending" | "approved_for_execution" | "rejected";
export type Role = "requester" | "approver" | "viewer" | "maker" | "platform_admin";

export interface Actor {
  id: string;
  role: Role;
  displayName: string;
  /**
   * Per-user resource scope resolved from the users table. "*" (platform
   * oversight) sees every scope. UI filtering is never authorization: every
   * list, detail, decision and audit path enforces this on the server.
   */
  scope: string;
}

export interface DecidableRecord {
  id: string;
  status: RecordStatus;
  /** Team scope the record belongs to. */
  scope: string;
  version: number;
  requested_by: string;
}

export interface DecisionRequest<T extends DecidableRecord> {
  db: Db;
  table: DecidableTable;
  entityType: EntityType;
  entityId: string;
  actor: Actor;
  /**
   * Roles the platform registry lets decide this entity. The kernel has no
   * opinion of its own: narrowing a workflow's `decisionRoles` changes what
   * the API accepts, not only what the UI offers.
   */
  decisionRoles: readonly Role[];
  action: DecisionAction;
  reason: string;
  expectedVersion: number;
  idempotencyKey?: string;
  /** Domain rules evaluated inside the transaction, after generic checks. */
  validate?: (record: T, ctx: { db: Db; action: DecisionAction }) => void;
  /** Extra audit payload, evaluated inside the transaction. */
  detail?: (record: T) => Record<string, unknown>;
  /** Test seam: lets tests make the audit write fail to prove rollback. */
  onAuditWrite?: () => void;
  now?: () => string;
}

export type DecisionErrorCode =
  | "not_found"
  | "forbidden_role"
  | "self_approval_forbidden"
  | "reason_required"
  | "illegal_transition"
  | "version_conflict"
  | "idempotency_conflict"
  | "domain_rule";

export class DecisionError extends Error {
  constructor(
    readonly code: DecisionErrorCode,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "DecisionError";
  }
}

export interface DecisionResult<T extends DecidableRecord> {
  record: T;
  eventId: string;
  duplicate: boolean;
}

const TERMINAL: Record<DecisionAction, RecordStatus> = {
  approve: "approved_for_execution",
  reject: "rejected",
};

const MIN_REASON_LENGTH = 5;

const STATUS_LABEL: Record<RecordStatus, string> = {
  pending: "pending",
  approved_for_execution: "approved for execution",
  rejected: "rejected",
};

/** Replay is only replay if the whole request matches, not just the key. */
interface RequestFingerprint {
  entity_type: string;
  entity_id: string;
  actor_id: string;
  action: string;
  reason: string;
  from_version: number | null;
}

function normalizeReason(reason: string): string {
  return reason.trim().replace(/\s+/g, " ");
}

/** Whether an actor may touch a record in `scope`. "*" is platform oversight. */
export function scopeAllows(actor: { scope: string }, recordScope: string): boolean {
  return actor.scope === "*" || actor.scope === recordScope;
}

/**
 * Shared reason floor, reused by the kernel and by domain validators that
 * need a stricter length (the vendor workflow's 20-character approval
 * narrative). Kept in one place so the two checks cannot drift apart.
 */
export function assertReasonLength(
  reason: string,
  min: number,
  message: string,
  code: "reason_required" | "domain_rule" = "reason_required",
): void {
  if (reason.trim().length < min) {
    throw new DecisionError(code, message, 400);
  }
}

export function decide<T extends DecidableRecord>(req: DecisionRequest<T>): DecisionResult<T> {
  const {
    db,
    table,
    entityType,
    entityId,
    actor,
    decisionRoles,
    action,
    expectedVersion,
    validate,
    detail,
    onAuditWrite,
  } = req;
  const now = req.now ?? (() => new Date().toISOString());
  const reason = (req.reason ?? "").trim();
  const idempotencyKey = req.idempotencyKey?.trim() || randomUUID();

  const run = db.transaction((): DecisionResult<T> => {
    const record = readRecord<T>(db, table, entityId);
    if (!record || !scopeAllows(actor, record.scope)) {
      // A record outside the actor's scope is answered the same way as one
      // that does not exist, so a guessed id reveals nothing.
      throw new DecisionError("not_found", "Record not found", 404);
    }

    if (!decisionRoles.includes(actor.role)) {
      throw new DecisionError(
        "forbidden_role",
        `Role '${actor.role}' may not decide ${entityType} records`,
        403,
      );
    }
    if (record.requested_by === actor.id) {
      throw new DecisionError(
        "self_approval_forbidden",
        "Separation of duties: the requester of a record may not decide it",
        403,
      );
    }
    assertReasonLength(
      reason,
      MIN_REASON_LENGTH,
      `A decision reason of at least ${MIN_REASON_LENGTH} characters is required`,
    );
    // Replay handling runs only after the caller has been authorized for the
    // record they actually asked about, and only for a byte-for-byte identical
    // request. Any other reuse of the key is a conflict: a cached result must
    // never be handed to a different actor, record, action or payload.
    const existing = db
      .prepare(
        `SELECT id, entity_type, entity_id, actor_id, action, reason, from_version
           FROM decision_events WHERE idempotency_key = ?`,
      )
      .get(idempotencyKey) as (RequestFingerprint & { id: string }) | undefined;
    if (existing) {
      const matches =
        existing.entity_type === entityType &&
        existing.entity_id === entityId &&
        existing.actor_id === actor.id &&
        existing.action === action &&
        normalizeReason(existing.reason) === normalizeReason(reason) &&
        existing.from_version === expectedVersion;
      if (!matches) {
        throw new DecisionError(
          "idempotency_conflict",
          "This idempotency key was already used for a different request",
          409,
        );
      }
      return { record, eventId: existing.id, duplicate: true };
    }

    if (record.status !== "pending") {
      throw new DecisionError(
        "illegal_transition",
        `Someone already decided this record: it is ${STATUS_LABEL[record.status]}. ` +
          "Refresh to see the current state and its audit timeline.",
        409,
      );
    }
    if (record.version !== expectedVersion) {
      throw new DecisionError(
        "version_conflict",
        `Record was modified by someone else (expected version ${expectedVersion}, found ${record.version})`,
        409,
      );
    }

    if (validate) validate(record, { db, action });

    const toStatus = TERMINAL[action];
    const toVersion = record.version + 1;
    const decidedAt = now();

    const updated = db
      .prepare(
        `UPDATE ${table}
            SET status = ?, version = ?, decided_by = ?, decided_at = ?, decision_reason = ?
          WHERE id = ? AND version = ? AND status = 'pending'`,
      )
      .run(toStatus, toVersion, actor.id, decidedAt, reason, entityId, expectedVersion);

    if (updated.changes !== 1) {
      throw new DecisionError("version_conflict", "Record was modified concurrently", 409);
    }

    if (onAuditWrite) onAuditWrite();

    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO decision_events
         (id, entity_type, entity_id, action, actor_id, actor_role, reason,
          from_status, to_status, from_version, to_version, idempotency_key, created_at, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      eventId,
      entityType,
      entityId,
      action,
      actor.id,
      actor.role,
      reason,
      record.status,
      toStatus,
      record.version,
      toVersion,
      idempotencyKey,
      decidedAt,
      JSON.stringify(detail ? detail(record) : {}),
    );

    const after = readRecord<T>(db, table, entityId)!;
    return { record: after, eventId, duplicate: false };
  });

  // IMMEDIATE so concurrent writers serialize on the write lock rather than
  // discovering the conflict at COMMIT time.
  return (run as unknown as { immediate: () => DecisionResult<T> }).immediate();
}

export function recordCreatedEvent(args: {
  db: Db;
  entityType: EntityType;
  entityId: string;
  actor: Actor;
  reason: string;
  detail: Record<string, unknown>;
  createdAt: string;
}): void {
  args.db
    .prepare(
      `INSERT INTO decision_events
         (id, entity_type, entity_id, action, actor_id, actor_role, reason,
          from_status, to_status, from_version, to_version, idempotency_key, created_at, detail_json)
       VALUES (?, ?, ?, 'create', ?, ?, ?, NULL, 'pending', NULL, 1, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      args.entityType,
      args.entityId,
      args.actor.id,
      args.actor.role,
      args.reason,
      randomUUID(),
      args.createdAt,
      JSON.stringify(args.detail),
    );
}

function readRecord<T extends DecidableRecord>(db: Db, table: string, id: string): T | undefined {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as T | undefined;
}
