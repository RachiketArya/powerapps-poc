/**
 * Per-user resource scope ("team scope") enforced server-side.
 *
 * Every seeded record and user is either `us-ops` or `emea-ops`; platform
 * admin is `*` oversight. A record outside the actor's scope is answered 404,
 * identically to one that does not exist, so a guessed id discloses nothing —
 * not even through a create-time balance validation or an idempotent replay.
 */
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app.js";
import { openDb, type Db } from "../kernel/db.js";
import { seed } from "../kernel/seed.js";

const APPROVER = "u_apr_theo";
const REQUESTER = "u_req_nadia";
const EU_REQUESTER = "u_req_ovid";
const ADMIN = "u_adm_rhea";

let db: Db;
let app: Express;

beforeEach(() => {
  db = openDb(":memory:");
  seed(db);
  app = createApp(db);
});

async function login(userId: string): Promise<string> {
  const res = await request(app).post("/api/session").send({ userId });
  return res.headers["set-cookie"]![0]!;
}

describe("resource scope on list and detail", () => {
  it("hides the other team's records from the queue", async () => {
    const res = await request(app)
      .get("/api/apps/refund-review/records?status=all")
      .set("Cookie", await login(APPROVER));
    expect(res.status).toBe(200);
    const ids = (res.body.records as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain("rr_2001");
    expect(ids).not.toContain("rr_eu_8001");
    expect(ids).not.toContain("rr_eu_8002");
  });

  it("answers a guessed foreign-scope id exactly like a missing one", async () => {
    const detail = await request(app)
      .get("/api/apps/refund-review/records/rr_eu_8001")
      .set("Cookie", await login(APPROVER));
    expect(detail.status).toBe(404);
    expect(detail.body.error).toBe("not_found");
    expect(JSON.stringify(detail.body)).not.toContain("emea");
    expect(JSON.stringify(detail.body)).not.toContain("Ovid");

    const missing = await request(app)
      .get("/api/apps/refund-review/records/rr_9999")
      .set("Cookie", await login(APPROVER));
    expect(detail.body).toEqual(missing.body);
  });

  it("scopes the vendor workflow the same way", async () => {
    const res = await request(app)
      .get("/api/apps/vendor-bank-change-review/records/vbc_eu_9001")
      .set("Cookie", await login(APPROVER));
    expect(res.status).toBe(404);
  });

  it("withholds another team's audit history", async () => {
    const res = await request(app)
      .get("/api/apps/refund-review/records/rr_eu_8001/audit")
      .set("Cookie", await login(APPROVER));
    expect(res.status).toBe(404);
  });
});

describe("resource scope on writes", () => {
  it("refuses to create a request against another team's payment without disclosing it", async () => {
    const res = await request(app)
      .post("/api/apps/refund-review/records")
      .set("Cookie", await login(REQUESTER))
      .send({ paymentId: "pay_7001", amountCents: 100, reason: "probe of a foreign payment" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
    // The answer must not leak the foreign balance through an error message.
    expect(JSON.stringify(res.body)).not.toContain("2400");
    expect(JSON.stringify(res.body)).not.toContain("remaining");
    const created = db.prepare(`SELECT COUNT(*) AS n FROM refund_requests WHERE payment_id = 'pay_7001'`).get() as {
      n: number;
    };
    expect(created.n).toBe(2); // only the two seeded EMEA requests
  });

  it("does not offer another team's payments as creation options", async () => {
    const res = await request(app)
      .get("/api/apps/refund-review/payments")
      .set("Cookie", await login(REQUESTER));
    expect(res.status).toBe(200);
    const ids = (res.body.payments as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain("pay_1001");
    expect(ids).not.toContain("pay_7001");
  });

  it("refuses a decision on another team's record and changes nothing", async () => {
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_eu_8001/decision")
      .set("Cookie", await login(APPROVER))
      .send({ decision: "approve", reason: "attempting to decide a foreign record", expectedVersion: 1 });
    expect(res.status).toBe(404);
    const row = db.prepare(`SELECT status, version FROM refund_requests WHERE id = 'rr_eu_8001'`).get() as {
      status: string;
      version: number;
    };
    expect(row).toEqual({ status: "pending", version: 1 });
    const events = db
      .prepare(`SELECT COUNT(*) AS n FROM decision_events WHERE entity_id = 'rr_eu_8001' AND action = 'approve'`)
      .get() as { n: number };
    expect(events.n).toBe(0);
  });
});

describe("scope changes and degraded rows fail closed", () => {
  it("re-checks scope before an idempotent replay, so revoked access gets no cached result", async () => {
    const cookie = await login(APPROVER);
    const body = {
      decision: "approve" as const,
      reason: "verified against the payment",
      expectedVersion: 1,
      idempotencyKey: "scope-revoke-key",
    };
    const first = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);

    db.prepare(`UPDATE users SET scope = 'emea-ops' WHERE id = ?`).run(APPROVER);
    const replay = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send(body);
    expect(replay.status).toBe(404);
    expect(replay.body.duplicate).toBeUndefined();
  });

  it("fails closed when the user row has an empty scope", async () => {
    const cookie = await login(APPROVER);
    db.prepare(`UPDATE users SET scope = '' WHERE id = ?`).run(APPROVER);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2002/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "verified against the payment", expectedVersion: 1 });
    expect(res.status).toBe(404);
    const list = await request(app).get("/api/apps/refund-review/records?status=all").set("Cookie", cookie);
    expect(list.body.records).toEqual([]);
  });
});

describe("platform oversight scope", () => {
  it("lets the platform admin read across scopes but still not decide", async () => {
    const cookie = await login(ADMIN);
    const list = await request(app).get("/api/apps/refund-review/records?status=all").set("Cookie", cookie);
    const ids = (list.body.records as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain("rr_eu_8001");

    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_eu_8001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "platform oversight attempting a business decision", expectedVersion: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden_role");
  });

  it("lets the scoped owner of a foreign-scope record see only their own scope", async () => {
    const cookie = await login(EU_REQUESTER);
    const list = await request(app).get("/api/apps/refund-review/records?status=all").set("Cookie", cookie);
    const ids = (list.body.records as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toEqual(["rr_eu_8002", "rr_eu_8001"]);
    const us = await request(app).get("/api/apps/refund-review/records/rr_2001").set("Cookie", cookie);
    expect(us.status).toBe(404);
  });
});
