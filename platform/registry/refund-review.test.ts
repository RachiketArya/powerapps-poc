import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app.js";
import { openDb, type Db } from "../kernel/db.js";
import { seed } from "../kernel/seed.js";
import { decideRefund } from "./refund-review.js";
import { DecisionError } from "../kernel/decision-service.js";

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
  expect(res.status).toBe(200);
  const cookie = res.headers["set-cookie"];
  return Array.isArray(cookie) ? cookie[0]! : (cookie as unknown as string);
}

function refundRow(id: string) {
  return db.prepare(`SELECT * FROM refund_requests WHERE id = ?`).get(id) as {
    status: string;
    version: number;
    decided_by: string | null;
  };
}

function eventCount(id: string): number {
  return (
    db
      .prepare(`SELECT COUNT(*) AS n FROM decision_events WHERE entity_id = ? AND action <> 'create'`)
      .get(id) as { n: number }
  ).n;
}

describe("session and identity", () => {
  it("rejects unauthenticated reads and decisions", async () => {
    const list = await request(app).get("/api/apps/refund-review/records");
    expect(list.status).toBe(401);

    const decision = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .send({ decision: "approve", reason: "no session at all", expectedVersion: 1 });
    expect(decision.status).toBe(401);
    expect(refundRow("rr_2001").status).toBe("pending");
  });

  it("resolves the actor server-side and reports it as simulated", async () => {
    const cookie = await login(APPROVER_A);
    const me = await request(app).get("/api/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.actor.id).toBe(APPROVER_A);
    expect(me.body.simulated).toBe(true);
  });
});

describe("role checks", () => {
  it("forbids a viewer from deciding", async () => {
    const cookie = await login(VIEWER);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "viewer attempting to approve", expectedVersion: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden_role");
    expect(refundRow("rr_2001").status).toBe("pending");
    expect(eventCount("rr_2001")).toBe(0);
  });

  it("forbids a requester from deciding", async () => {
    const cookie = await login(REQUESTER);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "requester attempting to approve", expectedVersion: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden_role");
  });

  it("forbids a viewer from creating a request", async () => {
    const cookie = await login(VIEWER);
    const res = await request(app)
      .post("/api/apps/refund-review/records")
      .set("Cookie", cookie)
      .send({ paymentId: "pay_1001", amountCents: 100, reason: "viewer attempting to create" });
    expect(res.status).toBe(403);
  });
});

describe("separation of duties (independent of role checks)", () => {
  it("lets an approver create a request but not decide it, while a second approver can", async () => {
    const approverA = await login(APPROVER_A);
    const created = await request(app)
      .post("/api/apps/refund-review/records")
      .set("Cookie", approverA)
      .send({ paymentId: "pay_1001", amountCents: 1_00, reason: "Approver-raised synthetic request" });
    expect(created.status).toBe(201);
    const id = created.body.record.id as string;
    expect(created.body.record.requested_by).toBe(APPROVER_A);

    // Same user, same approver role: refused purely because of separation of duties.
    const self = await request(app)
      .post(`/api/apps/refund-review/records/${id}/decision`)
      .set("Cookie", approverA)
      .send({ decision: "approve", reason: "approving my own request", expectedVersion: 1 });
    expect(self.status).toBe(403);
    expect(self.body.error).toBe("self_approval_forbidden");
    expect(refundRow(id).status).toBe("pending");
    expect(eventCount(id)).toBe(0);

    // A different approver, same role, succeeds.
    const approverB = await login(APPROVER_B);
    const ok = await request(app)
      .post(`/api/apps/refund-review/records/${id}/decision`)
      .set("Cookie", approverB)
      .send({ decision: "approve", reason: "independent review complete", expectedVersion: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.record.status).toBe("approved_for_execution");
    expect(ok.body.record.decided_by).toBe(APPROVER_B);
    expect(eventCount(id)).toBe(1);
  });

  it("blocks self-decision on the seeded approver-raised request", async () => {
    const approverA = await login(APPROVER_A);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2008/decision")
      .set("Cookie", approverA)
      .send({ decision: "reject", reason: "rejecting my own request", expectedVersion: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("self_approval_forbidden");
  });
});

describe("forged actor and role in the request body", () => {
  it("ignores actor/role fields supplied by the client", async () => {
    const viewer = await login(VIEWER);
    const forged = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", viewer)
      .send({
        decision: "approve",
        reason: "forging an approver identity",
        expectedVersion: 1,
        actorId: APPROVER_A,
        actor: { id: APPROVER_A, role: "approver" },
        role: "approver",
      });
    expect(forged.status).toBe(403);
    expect(forged.body.error).toBe("forbidden_role");
    expect(refundRow("rr_2001").status).toBe("pending");
  });

  it("records the session actor, not a forged one, on a successful decision", async () => {
    const approverA = await login(APPROVER_A);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", approverA)
      .send({
        decision: "approve",
        reason: "legitimate approval with forged actor fields attached",
        expectedVersion: 1,
        actorId: APPROVER_B,
        role: "viewer",
      });
    expect(res.status).toBe(200);
    expect(res.body.record.decided_by).toBe(APPROVER_A);
    const event = db
      .prepare(`SELECT actor_id, actor_role FROM decision_events WHERE entity_id = ? AND action = 'approve'`)
      .get("rr_2001") as { actor_id: string; actor_role: string };
    expect(event.actor_id).toBe(APPROVER_A);
    expect(event.actor_role).toBe("approver");
  });
});

describe("amount and reason validation", () => {
  it.each([
    ["zero", 0],
    ["negative", -500],
    ["fractional cents", 10.5],
  ])("rejects %s amounts", async (_label, amountCents) => {
    const cookie = await login(REQUESTER);
    const res = await request(app)
      .post("/api/apps/refund-review/records")
      .set("Cookie", cookie)
      .send({ paymentId: "pay_1001", amountCents, reason: "Synthetic invalid amount test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_amount");
  });

  it("rejects an amount above the remaining refundable balance", async () => {
    const cookie = await login(REQUESTER);
    // pay_1004 is 1200_00 with 200_00 already approved for execution.
    const res = await request(app)
      .post("/api/apps/refund-review/records")
      .set("Cookie", cookie)
      .send({ paymentId: "pay_1004", amountCents: 1_000_01, reason: "Over the remaining balance" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("exceeds_remaining_balance");
  });

  it("accepts an amount exactly equal to the remaining balance", async () => {
    const cookie = await login(REQUESTER);
    const res = await request(app)
      .post("/api/apps/refund-review/records")
      .set("Cookie", cookie)
      .send({ paymentId: "pay_1004", amountCents: 1_000_00, reason: "Exactly the remaining balance" });
    expect(res.status).toBe(201);
  });

  it("requires a decision reason", async () => {
    const cookie = await login(APPROVER_A);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "   ", expectedVersion: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reason_required");
    expect(refundRow("rr_2001").status).toBe("pending");
  });
});

describe("transitions, staleness and duplicate decisions", () => {
  it("refuses a second decision on an already decided record", async () => {
    const cookie = await login(APPROVER_A);
    const first = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "first and only decision", expectedVersion: 1 });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", await login(APPROVER_B))
      .send({ decision: "reject", reason: "attempting to overturn", expectedVersion: 2 });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("illegal_transition");
    expect(refundRow("rr_2001").status).toBe("approved_for_execution");
    expect(eventCount("rr_2001")).toBe(1);
  });

  it("rejects a stale expectedVersion", async () => {
    const cookie = await login(APPROVER_A);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "stale version submitted", expectedVersion: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("version_conflict");
    expect(refundRow("rr_2001").status).toBe("pending");
  });

  it("treats a replayed decision with the same idempotency key as a no-op", async () => {
    const cookie = await login(APPROVER_A);
    const body = {
      decision: "approve" as const,
      reason: "double submit from an impatient click",
      expectedVersion: 1,
      idempotencyKey: "fixed-key-123",
    };
    const first = await request(app).post("/api/apps/refund-review/records/rr_2001/decision").set("Cookie", cookie).send(body);
    const second = await request(app).post("/api/apps/refund-review/records/rr_2001/decision").set("Cookie", cookie).send(body);

    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(refundRow("rr_2001").version).toBe(2);
    expect(eventCount("rr_2001")).toBe(1);
  });
});

describe("idempotency keys are scoped, not global", () => {
  const KEY = "review-key";

  async function approveRr2001(): Promise<void> {
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", await login(APPROVER_A))
      .send({ decision: "approve", reason: "first legitimate approval", expectedVersion: 1, idempotencyKey: KEY });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(false);
  }

  it("replays only for the same actor, record, action, reason and version", async () => {
    await approveRr2001();
    const same = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", await login(APPROVER_A))
      .send({ decision: "approve", reason: "first legitimate approval", expectedVersion: 1, idempotencyKey: KEY });
    expect(same.status).toBe(200);
    expect(same.body.duplicate).toBe(true);
    expect(same.body.record.id).toBe("rr_2001");
    expect(eventCount("rr_2001")).toBe(1);
  });

  it("does not hand a cached result to a viewer replaying the key", async () => {
    await approveRr2001();
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", await login(VIEWER))
      .send({ decision: "approve", reason: "first legitimate approval", expectedVersion: 1, idempotencyKey: KEY });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden_role");
  });

  it("does not hand a cached result to a different approver", async () => {
    await approveRr2001();
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", await login(APPROVER_B))
      .send({ decision: "approve", reason: "first legitimate approval", expectedVersion: 1, idempotencyKey: KEY });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("idempotency_conflict");
  });

  it("never returns another record when the key is reused on a different request", async () => {
    await approveRr2001();
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2002/decision")
      .set("Cookie", await login(APPROVER_A))
      .send({ decision: "approve", reason: "first legitimate approval", expectedVersion: 1, idempotencyKey: KEY });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("idempotency_conflict");
    expect(refundRow("rr_2002").status).toBe("pending");
  });

  it.each([
    ["a changed action", { decision: "reject", reason: "first legitimate approval", expectedVersion: 1 }],
    ["a changed reason", { decision: "approve", reason: "a different justification", expectedVersion: 1 }],
    ["a changed expected version", { decision: "approve", reason: "first legitimate approval", expectedVersion: 2 }],
  ])("rejects key reuse with %s", async (_label, body) => {
    await approveRr2001();
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", await login(APPROVER_A))
      .send({ ...body, idempotencyKey: KEY });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("idempotency_conflict");
    expect(refundRow("rr_2001").status).toBe("approved_for_execution");
    expect(eventCount("rr_2001")).toBe(1);
  });

  it("rejects a decision that reuses a creation event's key", async () => {
    const createKey = (
      db
        .prepare(`SELECT idempotency_key AS k FROM decision_events WHERE entity_id = 'rr_2001' AND action = 'create'`)
        .get() as { k: string }
    ).k;
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", await login(APPROVER_A))
      .send({ decision: "approve", reason: "reusing the creation key", expectedVersion: 1, idempotencyKey: createKey });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("idempotency_conflict");
    expect(refundRow("rr_2001").status).toBe("pending");
  });
});

describe("balance reservation across requests on the same payment", () => {
  it("does not let two different requests on one payment exceed the remaining balance", async () => {
    // pay_1002 is 4980_00; rr_2002 (1500_00) and rr_2003 (900_00) both fit
    // individually and together, so build a tighter pair on pay_1003 (62_50).
    const requester = await login(REQUESTER);
    const a = await request(app)
      .post("/api/apps/refund-review/records")
      .set("Cookie", requester)
      .send({ paymentId: "pay_1003", amountCents: 40_00, reason: "First claim on this payment" });
    expect(a.status).toBe(201);
    const b = await request(app)
      .post("/api/apps/refund-review/records")
      .set("Cookie", requester)
      .send({ paymentId: "pay_1003", amountCents: 22_50, reason: "Second claim on this payment" });
    expect(b.status).toBe(201);
    // Seeded rr_2004 already claims the full 62_50; both new ones are pending too.

    const approver = await login(APPROVER_A);
    const first = await request(app)
      .post(`/api/apps/refund-review/records/rr_2004/decision`)
      .set("Cookie", approver)
      .send({ decision: "approve", reason: "approving the full-value request", expectedVersion: 1 });
    expect(first.status).toBe(200);

    for (const id of [a.body.record.id, b.body.record.id] as string[]) {
      const res = await request(app)
        .post(`/api/apps/refund-review/records/${id}/decision`)
        .set("Cookie", approver)
        .send({ decision: "approve", reason: "attempting to over-reserve the payment", expectedVersion: 1 });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("domain_rule");
      expect(refundRow(id).status).toBe("pending");
    }

    const approvedTotal = (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM refund_requests
            WHERE payment_id = 'pay_1003' AND status = 'approved_for_execution'`,
        )
        .get() as { total: number }
    ).total;
    expect(approvedTotal).toBe(62_50);
  });

  it("serializes interleaved decisions on the same payment so the sum never exceeds the balance", async () => {
    const requester = await login(REQUESTER);
    const ids: string[] = [];
    // pay_1001 is 125_00: each 50_00 request is individually valid, but all
    // three together (150_00) would exceed the captured amount.
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post("/api/apps/refund-review/records")
        .set("Cookie", requester)
        .send({ paymentId: "pay_1001", amountCents: 50_00, reason: `Concurrent claim ${i + 1} on one payment` });
      expect(res.status).toBe(201);
      ids.push(res.body.record.id);
    }

    const approver = await login(APPROVER_A);
    const results = await Promise.all(
      ids.map((id) =>
        request(app)
          .post(`/api/apps/refund-review/records/${id}/decision`)
          .set("Cookie", approver)
          .send({ decision: "approve", reason: "concurrent approval attempt", expectedVersion: 1 }),
      ),
    );
    const approved = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    expect(approved.length).toBe(2);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.body.error).toBe("domain_rule");

    const total = (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM refund_requests
            WHERE payment_id = 'pay_1001' AND status = 'approved_for_execution'`,
        )
        .get() as { total: number }
    ).total;
    const payment = db.prepare(`SELECT amount_cents FROM payments WHERE id = 'pay_1001'`).get() as {
      amount_cents: number;
    };
    expect(total).toBeLessThanOrEqual(payment.amount_cents);
  });
});

describe("atomicity", () => {
  it("rolls the state change back when the audit write fails", async () => {
    const before = refundRow("rr_2001");
    expect(() =>
      decideRefund(
        db,
        { id: APPROVER_A, role: "approver", displayName: "Theo" },
        {
          id: "rr_2001",
          action: "approve",
          reason: "audit subsystem will fail mid-transaction",
          expectedVersion: 1,
          onAuditWrite: () => {
            throw new Error("simulated audit storage failure");
          },
        },
      ),
    ).toThrow(/simulated audit storage failure/);

    const after = refundRow("rr_2001");
    expect(after.status).toBe(before.status);
    expect(after.version).toBe(before.version);
    expect(after.decided_by).toBeNull();
    expect(eventCount("rr_2001")).toBe(0);
  });

  it("writes no event when a domain rule rejects the decision", () => {
    expect(() =>
      decideRefund(
        db,
        { id: APPROVER_A, role: "approver", displayName: "Theo" },
        { id: "rr_2007", action: "approve", reason: "already rejected record", expectedVersion: 2 },
      ),
    ).toThrow(DecisionError);
    expect(eventCount("rr_2007")).toBe(1); // only the seeded rejection event
  });
});

describe("persistence", () => {
  it("keeps decisions across a database reopen", async () => {
    const file = `/tmp/decision-desk-test-${Date.now()}.sqlite`;
    const fileDb = openDb(file);
    seed(fileDb);
    const fileApp = createApp(fileDb);

    const res = await request(fileApp).post("/api/session").send({ userId: APPROVER_A });
    const cookie = res.headers["set-cookie"] as unknown as string[];
    const decision = await request(fileApp)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie[0]!)
      .send({ decision: "approve", reason: "persisted across restart", expectedVersion: 1 });
    expect(decision.status).toBe(200);
    fileDb.close();

    const reopened = openDb(file);
    const row = reopened.prepare(`SELECT status, decided_by FROM refund_requests WHERE id = 'rr_2001'`).get() as {
      status: string;
      decided_by: string;
    };
    expect(row.status).toBe("approved_for_execution");
    expect(row.decided_by).toBe(APPROVER_A);
    const events = reopened
      .prepare(`SELECT COUNT(*) AS n FROM decision_events WHERE entity_id = 'rr_2001'`)
      .get() as { n: number };
    expect(events.n).toBe(2);
    reopened.close();
  });
});
