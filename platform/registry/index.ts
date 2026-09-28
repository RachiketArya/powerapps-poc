/**
 * Trusted workflow registry — platform-owned.
 *
 * An app definition may *select from* what is declared here. It can never add
 * to it: the permitted roles, capability ceiling, approved connectors, field
 * vocabulary and the server-side business rules all live in this file and in
 * the domain modules it points at. A manifest that asks for anything outside
 * these tables is refused by the validator before it reaches the catalog.
 */
import type { Role } from "../kernel/decision-service.js";

export type Capability =
  | "queue.read"
  | "record.read"
  | "record.create"
  | "decision.approve"
  | "decision.reject"
  | "audit.read";

export interface WorkflowSpec {
  /** Stable key referenced by a manifest's `workflow` field. */
  key: string;
  title: string;
  /** Entity the runtime serves for this workflow. */
  entityType: "refund_request" | "vendor_bank_change";
  /** The only connectors a manifest may name for this workflow. */
  approvedConnectorIds: readonly string[];
  /**
   * Platform entitlement ceiling. A manifest may request a subset; requesting
   * anything outside it is a privilege expansion and is refused. This is not
   * supplied by the app or by the acting user.
   */
  capabilityCeiling: readonly Capability[];
  /** Roles the runtime will let act at all, regardless of manifest content. */
  decisionRoles: readonly Role[];
  /** Field vocabulary a manifest may select for list columns / detail fields. */
  listFields: readonly string[];
  detailFields: readonly string[];
  /** Business rules the manifest cannot switch off, shown in the UI and docs. */
  nonNegotiableControls: readonly string[];
}

/**
 * Synthetic local data adapters. These are in-process readers over the demo
 * SQLite file — they are NOT real integrations, and "approved connector" here
 * means "an identifier the platform recognises", not a network boundary.
 */
export const APPROVED_CONNECTORS = [
  {
    id: "synthetic.payments.local",
    title: "Synthetic payments ledger (local)",
    description: "In-process reader over the seeded payments and refund tables. No network calls.",
  },
  {
    id: "synthetic.vendor-master.local",
    title: "Synthetic vendor master (local)",
    description: "In-process reader over the seeded vendor bank-change table. No network calls.",
  },
] as const;

export const WORKFLOWS: Record<string, WorkflowSpec> = {
  refund_review: {
    key: "refund_review",
    title: "Refund review",
    entityType: "refund_request",
    approvedConnectorIds: ["synthetic.payments.local"],
    capabilityCeiling: ["queue.read", "record.read", "record.create", "decision.approve", "decision.reject", "audit.read"],
    decisionRoles: ["approver"],
    listFields: ["id", "payment_reference", "customer_label", "amount_cents", "status", "requester_name", "created_at"],
    detailFields: [
      "id",
      "payment_reference",
      "customer_label",
      "payment_amount_cents",
      "remaining_refundable_cents",
      "amount_cents",
      "reason",
      "status",
      "version",
      "requester_name",
      "decider_name",
      "decision_reason",
      "created_at",
    ],
    nonNegotiableControls: [
      "Decision requires an approver session resolved server-side from the demo session cookie",
      "The requester of a record may never decide it",
      "A decision reason of at least 5 characters is required",
      "Optimistic version check, single legal transition out of pending",
      "Approved refunds may never exceed the payment's remaining refundable balance",
      "State change and audit event are written in one transaction",
    ],
  },
  vendor_bank_change_review: {
    key: "vendor_bank_change_review",
    title: "Vendor bank-change review",
    entityType: "vendor_bank_change",
    approvedConnectorIds: ["synthetic.vendor-master.local"],
    capabilityCeiling: ["queue.read", "record.read", "record.create", "decision.approve", "decision.reject", "audit.read"],
    decisionRoles: ["approver"],
    listFields: ["id", "vendor_name", "current_masked_ref", "new_masked_ref", "country", "verification_channel", "status", "created_at"],
    detailFields: [
      "id",
      "vendor_name",
      "current_masked_ref",
      "new_masked_ref",
      "country",
      "verification_channel",
      "reason",
      "status",
      "version",
      "requester_name",
      "decider_name",
      "decision_reason",
      "created_at",
    ],
    nonNegotiableControls: [
      "Decision requires an approver session resolved server-side from the demo session cookie",
      "The requester of a change may never decide it",
      "A change requested over inbound email only can never be approved",
      "An approval reason of at least 20 characters is required",
      "Optimistic version check, single legal transition out of pending",
      "State change and audit event are written in one transaction",
    ],
  },
};

export function workflowKeys(): string[] {
  return Object.keys(WORKFLOWS);
}
