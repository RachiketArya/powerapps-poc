import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app.js";
import { openDb, type Db } from "../kernel/db.js";
import { seed } from "../kernel/seed.js";
import { decideVendorBankChange } from "./vendor-bank-change-review.js";

const REQUESTER = "u_req_nadia";
const APPROVER_A = "u_apr_theo";
const APPROVER_B = "u_apr_mira";
const VIEWER = "u_view_sam";

let db: Db;
let appsDir: string;
let app: Express;

beforeEach(() => {
  appsDir = fs.mkdtempSync(path.join(os.tmpdir(), "control-room-apps-"));
  process.env.CONTROL_ROOM_APPS_DIR = appsDir;
  db = openDb(":memory:");
  seed(db);
  app = createApp(db);
});

async function login(userId: string): Promise<string> {
  const res = await request(app).post("/api/session").send({ userId });
  const cookie = res.headers["set-cookie"];
  return Array.isArray(cookie) ? cookie[0]! : (cookie as unknown as string);
}

function row(id: string) {
  return db.prepare(`SELECT * FROM vendor_bank_changes WHERE id = ?`).get(id) as {
    status: string;
    version: number;
    decided_by: string | null;
  };
}

function decisionEvents(id: string): number {
  return (
    db
      .prepare(`SELECT COUNT(*) AS n FROM decision_events WHERE entity_id = ? AND action <> 'create'`)
      .get(id) as { n: number }
  ).n;
}

const GOOD_APPROVAL_REASON = "Verified by callback to the vendor number on file since 2024";

describe("shared controls are inherited by the vendor queue", () => {
  it("rejects unauthenticated access", async () => {
    expect((await request(app).get("/api/apps/vendor-bank-change-review/records")).status).toBe(401);
    const res = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision")
      .send({ decision: "approve", reason: GOOD_APPROVAL_REASON, expectedVersion: 1 });
    expect(res.status).toBe(401);
  });

  it("forbids viewers and requesters from deciding", async () => {
    for (const user of [VIEWER, REQUESTER]) {
      const res = await request(app)
        .post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision")
        .set("Cookie", await login(user))
        .send({ decision: "approve", reason: GOOD_APPROVAL_REASON, expectedVersion: 1 });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden_role");
    }
    expect(row("vbc_3001").status).toBe("pending");
  });

  it("forbids self-decision by an approver who raised the change, and allows a second approver", async () => {
    // vbc_3003 was raised by approver Theo.
    const self = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3003/decision")
      .set("Cookie", await login(APPROVER_A))
      .send({ decision: "approve", reason: GOOD_APPROVAL_REASON, expectedVersion: 1 });
    expect(self.status).toBe(403);
    expect(self.body.error).toBe("self_approval_forbidden");

    const other = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3003/decision")
      .set("Cookie", await login(APPROVER_B))
      .send({ decision: "approve", reason: GOOD_APPROVAL_REASON, expectedVersion: 1 });
    expect(other.status).toBe(200);
    expect(other.body.record.status).toBe("approved_for_execution");
    expect(other.body.record.decided_by).toBe(APPROVER_B);
  });

  it("ignores a forged actor in the body", async () => {
    const res = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision")
      .set("Cookie", await login(VIEWER))
      .send({
        decision: "approve",
        reason: GOOD_APPROVAL_REASON,
        expectedVersion: 1,
        actorId: APPROVER_A,
        role: "approver",
      });
    expect(res.status).toBe(403);
    expect(row("vbc_3001").status).toBe("pending");
  });

  it("rejects stale versions and duplicate submissions", async () => {
    const cookie = await login(APPROVER_A);
    const stale = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: GOOD_APPROVAL_REASON, expectedVersion: 9 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("version_conflict");

    const body = {
      decision: "approve" as const,
      reason: GOOD_APPROVAL_REASON,
      expectedVersion: 1,
      idempotencyKey: "vbc-key-1",
    };
    const first = await request(app).post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision").set("Cookie", cookie).send(body);
    const second = await request(app).post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision").set("Cookie", cookie).send(body);
    expect(first.body.duplicate).toBe(false);
    expect(second.body.duplicate).toBe(true);
    expect(row("vbc_3001").version).toBe(2);
    expect(decisionEvents("vbc_3001")).toBe(1);
  });

  it("rolls back the state change when the audit write fails", () => {
    expect(() =>
      decideVendorBankChange(
        db,
        { id: APPROVER_A, role: "approver", displayName: "Theo" },
        {
          id: "vbc_3001",
          action: "approve",
          reason: GOOD_APPROVAL_REASON,
          expectedVersion: 1,
          onAuditWrite: () => {
            throw new Error("simulated audit storage failure");
          },
        },
      ),
    ).toThrow(/simulated audit storage failure/);
    expect(row("vbc_3001").status).toBe("pending");
    expect(decisionEvents("vbc_3001")).toBe(0);
  });
});

describe("vendor-specific validation", () => {
  it("requires masked references with only four visible digits", async () => {
    const cookie = await login(REQUESTER);
    const res = await request(app)
      .post("/api/apps/vendor-bank-change-review/records")
      .set("Cookie", cookie)
      .send({
        vendorName: "Testco (synthetic)",
        currentMaskedRef: "12345678-9012",
        newMaskedRef: "••••-••••-3308",
        country: "US",
        verificationChannel: "callback_to_known_number",
        reason: "Unmasked reference should be refused",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_masked_reference");
  });

  it("refuses a change that does not change anything", async () => {
    const res = await request(app)
      .post("/api/apps/vendor-bank-change-review/records")
      .set("Cookie", await login(REQUESTER))
      .send({
        vendorName: "Testco (synthetic)",
        currentMaskedRef: "••••-••••-4417",
        newMaskedRef: "••••-••••-4417",
        country: "US",
        verificationChannel: "callback_to_known_number",
        reason: "Identical references",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unchanged_account");
  });

  it("refuses an unsupported country", async () => {
    const res = await request(app)
      .post("/api/apps/vendor-bank-change-review/records")
      .set("Cookie", await login(REQUESTER))
      .send({
        vendorName: "Testco (synthetic)",
        currentMaskedRef: "••••-••••-4417",
        newMaskedRef: "••••-••••-8890",
        country: "ZZ",
        verificationChannel: "callback_to_known_number",
        reason: "Unsupported country",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unsupported_country");
  });

  it("cannot approve a change requested over an unverifiable channel, but can reject it", async () => {
    const cookie = await login(APPROVER_A);
    const approve = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3002/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: GOOD_APPROVAL_REASON, expectedVersion: 1 });
    expect(approve.status).toBe(409);
    expect(approve.body.error).toBe("domain_rule");
    expect(row("vbc_3002").status).toBe("pending");
    expect(decisionEvents("vbc_3002")).toBe(0);

    const reject = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3002/decision")
      .set("Cookie", cookie)
      .send({ decision: "reject", reason: "Inbound email only; cannot verify the requester", expectedVersion: 1 });
    expect(reject.status).toBe(200);
    expect(row("vbc_3002").status).toBe("rejected");
  });

  it("requires a fuller verification narrative to approve than the generic minimum", async () => {
    const cookie = await login(APPROVER_A);
    const res = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "looks ok", expectedVersion: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("domain_rule");
    expect(row("vbc_3001").status).toBe("pending");

    const ok = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: GOOD_APPROVAL_REASON, expectedVersion: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.record.status).toBe("approved_for_execution");
    expect(ok.body.note).toContain("No bank record is updated");
  });
});

describe("idempotency keys do not leak across workflows", () => {
  it("refuses a vendor decision that reuses a refund decision's key", async () => {
    const cookie = await login(APPROVER_A);
    const key = "shared-key-across-workflows";
    const refund = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "refund approved first", expectedVersion: 1, idempotencyKey: key });
    expect(refund.status).toBe(200);

    const vendor = await request(app)
      .post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: GOOD_APPROVAL_REASON, expectedVersion: 1, idempotencyKey: key });
    expect(vendor.status).toBe(409);
    expect(vendor.body.error).toBe("idempotency_conflict");
    expect(row("vbc_3001").status).toBe("pending");
    expect(decisionEvents("vbc_3001")).toBe(0);
  });
});
