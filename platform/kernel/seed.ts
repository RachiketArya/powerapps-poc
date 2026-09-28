import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.js";
import { promoteDefinition } from "../manifest/store.js";

/**
 * Entirely synthetic demo data. No real customers, cards, banks or employers.
 * Amounts are integer cents.
 */

export const DEMO_USERS = [
  {
    id: "u_req_nadia",
    display_name: "Nadia Okoro (Support Ops)",
    role: "requester" as const,
    team: "Customer Support",
  },
  {
    id: "u_apr_theo",
    display_name: "Theo Lindqvist (Risk Review)",
    role: "approver" as const,
    team: "Risk",
  },
  {
    id: "u_apr_mira",
    display_name: "Mira Castellanos (Risk Review)",
    role: "approver" as const,
    team: "Risk",
  },
  {
    id: "u_view_sam",
    display_name: "Sam Deverell (Audit, read-only)",
    role: "viewer" as const,
    team: "Internal Audit",
  },
  {
    id: "u_mkr_juno",
    display_name: "Juno Aparicio (Ops maker)",
    role: "maker" as const,
    team: "Payments Operations",
  },
  {
    id: "u_adm_rhea",
    display_name: "Rhea Vanterpool (Platform admin)",
    role: "platform_admin" as const,
    team: "Internal Platform",
  },
];

/** Definitions shipped with the repository, promoted on seed. */
export const STARTER_APP_FILES = ["refund-review.app.json", "vendor-bank-change-review.app.json"];

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

const PAYMENTS = [
  ["pay_1001", "SYN-PAY-1001", "Acct 4417 · Synthetic customer A", 125_00, "USD", "2026-09-02T10:14:00.000Z"],
  ["pay_1002", "SYN-PAY-1002", "Acct 9925 · Synthetic customer B", 4_980_00, "USD", "2026-09-04T16:02:00.000Z"],
  ["pay_1003", "SYN-PAY-1003", "Acct 3310 · Synthetic customer C", 62_50, "USD", "2026-09-06T08:41:00.000Z"],
  ["pay_1004", "SYN-PAY-1004", "Acct 7781 · Synthetic customer D", 1_200_00, "USD", "2026-09-09T13:27:00.000Z"],
  ["pay_1005", "SYN-PAY-1005", "Acct 2043 · Synthetic customer E", 349_99, "USD", "2026-09-11T19:55:00.000Z"],
  ["pay_1006", "SYN-PAY-1006", "Acct 6672 · Synthetic customer F", 15_000_00, "USD", "2026-09-14T07:09:00.000Z"],
] as const;

const REFUNDS = [
  ["rr_2001", "pay_1001", 25_00, "Duplicate charge reported by cardholder", "pending", "u_req_nadia", "2026-09-15T09:00:00.000Z"],
  ["rr_2002", "pay_1002", 1_500_00, "Service outage credit, tier 2 approved scope", "pending", "u_req_nadia", "2026-09-15T09:12:00.000Z"],
  ["rr_2003", "pay_1002", 900_00, "Second partial credit for the same outage window", "pending", "u_req_nadia", "2026-09-15T09:14:00.000Z"],
  ["rr_2004", "pay_1003", 62_50, "Full refund, item never shipped", "pending", "u_req_nadia", "2026-09-15T10:02:00.000Z"],
  ["rr_2005", "pay_1004", 200_00, "Goodwill credit after failed delivery window", "approved_for_execution", "u_req_nadia", "2026-09-14T11:30:00.000Z"],
  ["rr_2006", "pay_1004", 150_00, "Follow-up goodwill credit, same order", "pending", "u_req_nadia", "2026-09-15T11:31:00.000Z"],
  ["rr_2007", "pay_1005", 349_99, "Chargeback pre-empt, customer dispute filed", "rejected", "u_req_nadia", "2026-09-13T14:20:00.000Z"],
  ["rr_2008", "pay_1006", 5_000_00, "Contract renegotiation credit, finance sign-off pending", "pending", "u_apr_theo", "2026-09-15T12:05:00.000Z"],
] as const;

const VENDOR_CHANGES = [
  ["vbc_3001", "Northwind Logistics (synthetic)", "••••-••••-4417", "••••-••••-8890", "US", "callback_to_known_number", "Bank merger; new remittance details confirmed by callback", "pending", "u_req_nadia", "2026-09-15T09:40:00.000Z"],
  ["vbc_3002", "Halcyon Data Co (synthetic)", "••••-••••-2231", "••••-••••-7745", "IE", "inbound_email_only", "Vendor emailed new treasury provider details", "pending", "u_req_nadia", "2026-09-15T10:12:00.000Z"],
  ["vbc_3003", "Meridian Facilities (synthetic)", "••••-••••-5560", "••••-••••-3308", "GB", "portal_message", "Change submitted through the vendor portal", "pending", "u_apr_theo", "2026-09-15T10:55:00.000Z"],
  ["vbc_3004", "Brightpath Cleaning (synthetic)", "••••-••••-9902", "••••-••••-1123", "US", "inbound_email_only", "Requested by email only; callback number unreachable", "rejected", "u_req_nadia", "2026-09-12T15:10:00.000Z"],
] as const;

export function seed(db: Db): void {
  const tx = db.transaction(() => {
    db.exec(
      `DELETE FROM decision_events;
       DELETE FROM vendor_bank_changes;
       DELETE FROM refund_requests;
       DELETE FROM payments;
       DELETE FROM demo_sessions;
       DELETE FROM platform_events;
       DELETE FROM app_definitions;
       DELETE FROM users;`,
    );

    const insUser = db.prepare(
      `INSERT INTO users (id, display_name, role, team) VALUES (@id, @display_name, @role, @team)`,
    );
    for (const u of DEMO_USERS) insUser.run(u);

    const insPay = db.prepare(
      `INSERT INTO payments (id, reference, customer_label, amount_cents, currency, captured_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const p of PAYMENTS) insPay.run(...p);

    const insRefund = db.prepare(
      `INSERT INTO refund_requests
         (id, payment_id, amount_cents, reason, status, requested_by, created_at,
          decided_by, decided_at, decision_reason, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insEvent = db.prepare(
      `INSERT INTO decision_events
         (id, entity_type, entity_id, action, actor_id, actor_role, reason,
          from_status, to_status, from_version, to_version, idempotency_key, created_at, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{"seeded":true}')`,
    );

    for (const [id, paymentId, amount, reason, status, requestedBy, createdAt] of REFUNDS) {
      const decided = status !== "pending";
      const decider = requestedBy === "u_apr_theo" ? "u_apr_mira" : "u_apr_theo";
      insRefund.run(
        id,
        paymentId,
        amount,
        reason,
        status,
        requestedBy,
        createdAt,
        decided ? decider : null,
        decided ? createdAt : null,
        decided ? "Reviewed against seeded synthetic policy" : null,
        decided ? 2 : 1,
      );
      insEvent.run(
        `ev_${id}_c`,
        "refund_request",
        id,
        "create",
        requestedBy,
        requestedBy.startsWith("u_apr") ? "approver" : "requester",
        reason,
        null,
        "pending",
        null,
        1,
        `seed_${id}_create`,
        createdAt,
      );
      if (decided) {
        insEvent.run(
          `ev_${id}_d`,
          "refund_request",
          id,
          status === "approved_for_execution" ? "approve" : "reject",
          decider,
          "approver",
          "Reviewed against seeded synthetic policy",
          "pending",
          status,
          1,
          2,
          `seed_${id}_decide`,
          createdAt,
        );
      }
    }

    const insVendor = db.prepare(
      `INSERT INTO vendor_bank_changes
         (id, vendor_name, current_masked_ref, new_masked_ref, country, verification_channel,
          reason, status, requested_by, created_at, decided_by, decided_at, decision_reason, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [id, vendor, oldRef, newRef, country, channel, reason, status, requestedBy, createdAt] of VENDOR_CHANGES) {
      const decided = status !== "pending";
      const decisionReason = "Could not verify the change through an independent channel";
      insVendor.run(
        id,
        vendor,
        oldRef,
        newRef,
        country,
        channel,
        reason,
        status,
        requestedBy,
        createdAt,
        decided ? "u_apr_theo" : null,
        decided ? createdAt : null,
        decided ? decisionReason : null,
        decided ? 2 : 1,
      );
      insEvent.run(
        `ev_${id}_c`,
        "vendor_bank_change",
        id,
        "create",
        requestedBy,
        requestedBy.startsWith("u_apr") ? "approver" : "requester",
        reason,
        null,
        "pending",
        null,
        1,
        `seed_${id}_create`,
        createdAt,
      );
      if (decided) {
        insEvent.run(
          `ev_${id}_d`,
          "vendor_bank_change",
          id,
          "reject",
          "u_apr_theo",
          "approver",
          decisionReason,
          "pending",
          status,
          1,
          2,
          `seed_${id}_decide`,
          createdAt,
        );
      }
    }
  });
  tx();
  seedCatalog(db);
}

/**
 * The starter apps go through the same promotion path as anything a maker
 * writes: validated, digested, audited and written to the active-apps
 * directory. There is no privileged "built in" route into the catalog.
 */
export function seedCatalog(db: Db): void {
  const admin = DEMO_USERS.find((u) => u.role === "platform_admin")!;
  const actor = { id: admin.id, role: admin.role, displayName: admin.display_name };
  for (const name of STARTER_APP_FILES) {
    const file = path.join(repoRoot(), "apps", name);
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    promoteDefinition(db, actor, raw);
  }
}
