/**
 * Regression tests for the defects found in independent review of e9af6e4.
 *
 * Each case reproduces the reported defect through the API or the store, so a
 * regression shows up as a failure rather than as prose in a document.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app.js";
import { openDb, type Db } from "../kernel/db.js";
import { seed } from "../kernel/seed.js";
import { digestOf, validateDefinition } from "./schema.js";
import { loadApp, promoteDefinition, PromotionError } from "./store.js";
import { getWorkflow, setDecisionRoles } from "../registry/index.js";

const ADMIN = "u_adm_rhea";
const APPROVER = "u_apr_theo";

let db: Db;
let app: Express;
let appsDir: string;

beforeEach(() => {
  appsDir = fs.mkdtempSync(path.join(os.tmpdir(), "control-room-repairs-"));
  process.env.CONTROL_ROOM_APPS_DIR = appsDir;
  db = openDb(":memory:");
  seed(db);
  app = createApp(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function login(userId: string): Promise<string> {
  const res = await request(app).post("/api/session").send({ userId });
  return res.headers["set-cookie"]![0]!;
}

function template(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../apps", name), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("audit.read is a real capability, not decoration", () => {
  it("withholds record history from an app that did not request audit.read", async () => {
    const admin = await login(ADMIN);
    const base = template("refund-review.app.json");
    const noAudit = {
      ...base,
      appId: "review-no-audit",
      title: "Refund review (no history)",
      capabilities: ["queue.read", "record.read"],
    };
    expect((await request(app).post("/api/catalog/promote").set("Cookie", admin).send({ definition: noAudit })).status).toBe(
      201,
    );

    const cookie = await login(APPROVER);
    const detail = await request(app).get("/api/apps/review-no-audit/records/rr_2001").set("Cookie", cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.record.events).toBeUndefined();
    expect(JSON.stringify(detail.body)).not.toContain("idempotency");

    const audit = await request(app).get("/api/apps/review-no-audit/records/rr_2001/audit").set("Cookie", cookie);
    expect(audit.status).toBe(403);
    expect(audit.body.error).toBe("capability_not_granted");
  });

  it("returns history to an app that did request audit.read", async () => {
    const cookie = await login(APPROVER);
    const detail = await request(app).get("/api/apps/refund-review/records/rr_2001").set("Cookie", cookie);
    expect(Array.isArray(detail.body.record.events)).toBe(true);
    const audit = await request(app).get("/api/apps/refund-review/records/rr_2001/audit").set("Cookie", cookie);
    expect(audit.status).toBe(200);
    expect(Array.isArray(audit.body.events)).toBe(true);
  });

  it("withholds history from a decision response for an app without audit.read", async () => {
    const admin = await login(ADMIN);
    const base = template("refund-review.app.json");
    await request(app)
      .post("/api/catalog/promote")
      .set("Cookie", admin)
      .send({
        definition: {
          ...base,
          appId: "review-decide-no-audit",
          title: "Refund review (decide only)",
          capabilities: ["queue.read", "record.read", "decision.approve", "decision.reject"],
        },
      });

    const cookie = await login(APPROVER);
    const res = await request(app)
      .post("/api/apps/review-decide-no-audit/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "checked against the payment", expectedVersion: 1 });
    expect(res.status).toBe(200);
    expect(res.body.record.events).toBeUndefined();
  });
});

describe("cross-app data routes are scoped or restricted", () => {
  it("does not expose cross-app activity to a non-admin session", async () => {
    const cookie = await login(APPROVER);
    const res = await request(app).get("/api/activity").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden_role");
  });

  it("exposes cross-app activity to the platform admin as oversight", async () => {
    const cookie = await login(ADMIN);
    const res = await request(app).get("/api/activity").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.platform)).toBe(true);
  });

  it("has no unscoped payments route and scopes payment options to a creating app", async () => {
    const cookie = await login(APPROVER);
    expect((await request(app).get("/api/payments").set("Cookie", cookie)).status).toBe(404);

    const scoped = await request(app).get("/api/apps/refund-review/payments").set("Cookie", cookie);
    expect(scoped.status).toBe(200);
    expect(scoped.body.payments.length).toBeGreaterThan(0);

    // The vendor workflow has no payments, and an app without record.create
    // gets no payment options at all.
    expect((await request(app).get("/api/apps/vendor-bank-change-review/payments").set("Cookie", cookie)).status).toBe(
      404,
    );

    const admin = await login(ADMIN);
    await request(app)
      .post("/api/catalog/promote")
      .set("Cookie", admin)
      .send({
        definition: {
          ...template("refund-review.app.json"),
          appId: "refund-review-readonly-payments",
          title: "Refund review (read only)",
          capabilities: ["queue.read", "record.read"],
        },
      });
    const denied = await request(app).get("/api/apps/refund-review-readonly-payments/payments").set("Cookie", cookie);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("capability_not_granted");
  });
});

describe("promotion cannot destroy the previous release", () => {
  it("leaves the active release intact when the content write fails", async () => {
    const admin = { id: ADMIN, role: "platform_admin" as const, displayName: "Rhea", scope: "*" };
    const base = template("refund-review.app.json");
    const before = loadApp(db, "refund-review")!;
    expect(before.status).toBe("active");
    expect(before.version).toBe(1);
    const beforeBody = fs.readFileSync(before.sourcePath!, "utf8");

    const spy = vi.spyOn(fs, "writeFileSync").mockImplementation(((file: fs.PathOrFileDescriptor) => {
      // Reproduces the reported failure: a partial write, then a throw.
      fs.appendFileSync(file as string, "{partial");
      throw new Error("disk full");
    }) as typeof fs.writeFileSync);

    expect(() => promoteDefinition(db, admin, { ...base, title: "Refund review v2" })).toThrow(PromotionError);
    spy.mockRestore();

    const after = loadApp(db, "refund-review")!;
    expect(after.status).toBe("active");
    expect(after.version).toBe(1);
    expect(after.sourcePath).toBe(before.sourcePath);
    expect(fs.readFileSync(after.sourcePath!, "utf8")).toBe(beforeBody);
  });

  it("leaves the active release intact when the catalog commit fails", async () => {
    const admin = { id: ADMIN, role: "platform_admin" as const, displayName: "Rhea", scope: "*" };
    const before = loadApp(db, "refund-review")!;
    const beforeBody = fs.readFileSync(before.sourcePath!, "utf8");

    // Database refuses writes: the pointer and audit transaction cannot commit.
    db.pragma("query_only = 1");
    expect(() => promoteDefinition(db, admin, { ...template("refund-review.app.json"), title: "Refund review v2" })).toThrow();
    db.pragma("query_only = 0");

    const after = loadApp(db, "refund-review")!;
    expect(after.status).toBe("active");
    expect(after.version).toBe(1);
    expect(fs.readFileSync(after.sourcePath!, "utf8")).toBe(beforeBody);
    // The orphan file is harmless: nothing in the catalog points at it.
    const pointed = (db.prepare(`SELECT source_path FROM app_definitions`).all() as Array<{ source_path: string }>).map(
      (r) => r.source_path,
    );
    for (const orphan of fs.readdirSync(appsDir).map((f) => path.join(appsDir, f))) {
      if (!pointed.includes(orphan)) expect(loadApp(db, "refund-review")!.sourcePath).not.toBe(orphan);
    }
  });

  it("gives each release its own immutable file so a new version never overwrites the old one", async () => {
    const admin = { id: ADMIN, role: "platform_admin" as const, displayName: "Rhea", scope: "*" };
    const v1 = loadApp(db, "refund-review")!;
    const v2 = promoteDefinition(db, admin, { ...template("refund-review.app.json"), title: "Refund review v2" });
    expect(v2.version).toBe(2);
    expect(v2.sourcePath).not.toBe(v1.sourcePath);
    expect(fs.existsSync(v1.sourcePath!)).toBe(true);
    expect(JSON.parse(fs.readFileSync(v1.sourcePath!, "utf8")).title).toBe("Refund review");
  });
});

describe("workflow lookup is not reachable through Object prototype keys", () => {
  for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    it(`refuses workflow '${key}' as an unknown workflow`, async () => {
      expect(getWorkflow(key)).toBeUndefined();

      const definition = { ...template("refund-review.app.json"), appId: "proto-probe", workflow: key };
      const outcome = validateDefinition(definition);
      expect(outcome.ok).toBe(false);
      expect(outcome.violations.map((v) => v.code)).toContain("unknown_workflow");

      const admin = await login(ADMIN);
      const res = await request(app).post("/api/catalog/promote").set("Cookie", admin).send({ definition });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe("definition_rejected");

      const validated = await request(app).post("/api/workshop/validate").set("Cookie", admin).send({ definition });
      expect(validated.status).toBe(200);
      expect(validated.body.ok).toBe(false);
    });
  }

  it("quarantines a persisted definition with a prototype workflow key even when its digest matches", async () => {
    // The digest is content identification, not a validity proof: a row whose
    // file and digest agree must still be re-validated, and must not 500.
    const bad = { ...template("refund-review.app.json"), appId: "proto-persisted", workflow: "toString" };
    const file = path.join(appsDir, "proto-persisted.forced.app.json");
    fs.writeFileSync(file, `${JSON.stringify(bad, null, 2)}\n`, "utf8");
    db.prepare(
      `INSERT INTO app_definitions (app_id, version, digest, definition_json, source_path, active, promoted_by, promoted_at)
       VALUES (?, 1, ?, ?, ?, 1, ?, ?)`,
    ).run("proto-persisted", digestOf(bad), JSON.stringify(bad), file, ADMIN, new Date().toISOString());

    const entry = loadApp(db, "proto-persisted")!;
    expect(entry.status).toBe("quarantined");
    expect(entry.findings.map((f) => f.code)).toContain("unknown_workflow");

    const cookie = await login(APPROVER);
    const res = await request(app).get("/api/apps/proto-persisted/records").set("Cookie", cookie);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("app_quarantined");
  });
});

describe("the registry is the single source of truth for decision roles", () => {
  it("enforces a narrowed decisionRoles policy on the API, not only in the UI", async () => {
    const cookie = await login(APPROVER);
    const ok = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "verified against the payment", expectedVersion: 1 });
    expect(ok.status).toBe(200);

    // Platform policy change: no role may decide refunds any more.
    const restore = setDecisionRoles("refund_review", []);
    try {
      const res = await request(app)
        .post("/api/apps/refund-review/records/rr_2002/decision")
        .set("Cookie", cookie)
        .send({ decision: "approve", reason: "verified against the payment", expectedVersion: 1 });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden_role");
      expect(
        (db.prepare(`SELECT status FROM refund_requests WHERE id = 'rr_2002'`).get() as { status: string }).status,
      ).toBe("pending");

      const registry = await request(app).get("/api/platform/registry").set("Cookie", cookie);
      const refund = (registry.body.workflows as Array<{ key: string; decisionRoles: string[] }>).find(
        (w) => w.key === "refund_review",
      )!;
      // What the UI reads and what the API enforces are the same value.
      expect(refund.decisionRoles).toEqual([]);
    } finally {
      restore();
    }

    const after = await request(app)
      .post("/api/apps/refund-review/records/rr_2002/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "verified against the payment", expectedVersion: 1 });
    expect(after.status).toBe(200);
  });

  it("enforces a narrowed policy on the vendor workflow too", async () => {
    const restore = setDecisionRoles("vendor_bank_change_review", ["platform_admin"]);
    try {
      const res = await request(app)
        .post("/api/apps/vendor-bank-change-review/records/vbc_3001/decision")
        .set("Cookie", await login(APPROVER))
        .send({
          decision: "approve",
          reason: "callback to the known number confirmed the new account",
          expectedVersion: 1,
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden_role");
    } finally {
      restore();
    }
  });
});

describe("the data adapter answers in the registry's field vocabulary", () => {
  it("returns every declared list and detail field as a value, not a nested object", async () => {
    const cookie = await login(APPROVER);
    const workflow = getWorkflow("refund_review")!;

    const list = await request(app).get("/api/apps/refund-review/records?status=all").set("Cookie", cookie);
    expect(list.status).toBe(200);
    const row = (list.body.records as Array<Record<string, unknown>>).find((r) => r["id"] === "rr_2001")!;
    for (const field of workflow.listFields) {
      expect(row[field], `list field ${field}`).not.toBeUndefined();
      expect(row[field], `list field ${field}`).not.toBeNull();
    }
    expect(row["payment_reference"]).toMatch(/^SYN-PAY-/);

    const detail = await request(app).get("/api/apps/refund-review/records/rr_2001").set("Cookie", cookie);
    const record = detail.body.record as Record<string, unknown>;
    for (const field of workflow.detailFields) {
      expect(record[field], `detail field ${field}`).not.toBeUndefined();
    }
    expect(typeof record["payment_amount_cents"]).toBe("number");
    // Payment details are carried once, in the registry's vocabulary.
    expect(record["payment"]).toBeUndefined();
  });
});

describe("assurance results are bound to a source revision", () => {
  it("reports the recorded revision, the current revision and whether it is stale", async () => {
    const cookie = await login(ADMIN);
    const res = await request(app).get("/api/assurance").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.revision).toBeDefined();
    expect(res.body.revision.note).toMatch(/last recorded run/i);
    expect(Object.keys(res.body.revision)).toEqual(
      expect.arrayContaining(["recordedFor", "current", "stale", "uncommittedChangesWhenRecorded"]),
    );
  });

  it("names capability narrowing as a surface control rather than data isolation", async () => {
    const cookie = await login(ADMIN);
    const res = await request(app).get("/api/assurance").set("Cookie", cookie);
    expect((res.body.productionGaps as string[]).some((g) => /not user data isolation/i.test(g))).toBe(true);
  });
});
