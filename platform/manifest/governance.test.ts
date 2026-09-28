/**
 * Adversarial tests for the governance boundary. Every case goes through the
 * HTTP API (or the store directly), never through UI state, because disabled
 * buttons are not a control.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app.js";
import { openDb, type Db } from "../kernel/db.js";
import { seed } from "../kernel/seed.js";
import { validateDefinition } from "./schema.js";
import { loadApp } from "./store.js";

const MAKER = "u_mkr_juno";
const ADMIN = "u_adm_rhea";
const APPROVER = "u_apr_theo";
const VIEWER = "u_view_sam";

let db: Db;
let app: Express;
let appsDir: string;

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

function example(name: string): Record<string, unknown> {
  const file = path.resolve(import.meta.dirname, "../../apps", name);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

function codes(violations: Array<{ code: string }>): string[] {
  return violations.map((v) => v.code);
}

describe("definition validation refuses unsafe definitions", () => {
  it("refuses a connection URL in place of an approved connector id", async () => {
    const outcome = validateDefinition(example("examples/unsafe-unapproved-connector.json"));
    expect(outcome.ok).toBe(false);
    expect(codes(outcome.violations)).toContain("url_not_allowed");
    expect(outcome.violations.every((v) => v.policy && v.nextAction)).toBe(true);
  });

  it("refuses unknown fields such as an audit or self-approval switch", async () => {
    const outcome = validateDefinition(example("examples/unsafe-audit-disabled.json"));
    expect(outcome.ok).toBe(false);
    expect(codes(outcome.violations)).toContain("unknown_field");
    const paths = outcome.violations.map((v) => v.path);
    expect(paths.some((p) => p.includes("requireAudit"))).toBe(true);
    expect(paths.some((p) => p.includes("bypassSelfApprovalCheck"))).toBe(true);
  });

  it("refuses capabilities outside the platform entitlement ceiling", async () => {
    const outcome = validateDefinition(example("examples/unsafe-privilege-expansion.json"));
    expect(outcome.ok).toBe(false);
    expect(codes(outcome.violations)).toContain("capability_outside_entitlement");
  });

  it("refuses markup in labels", async () => {
    const outcome = validateDefinition(example("examples/unsafe-markup.json"));
    expect(outcome.ok).toBe(false);
    expect(codes(outcome.violations)).toContain("markup_not_allowed");
  });

  it("refuses an unregistered workflow and its unavailable fields", async () => {
    const outcome = validateDefinition(example("examples/unsafe-invalid-workflow.json"));
    expect(outcome.ok).toBe(false);
    expect(codes(outcome.violations)).toContain("unknown_workflow");
  });

  it("refuses executable code, SQL and secret-looking values anywhere in the document", async () => {
    const base = example("refund-review.app.json");
    const cases: Array<[string, string]> = [
      ["() => doSomething()", "code_not_allowed"],
      ["select amount_cents from payments", "sql_not_allowed"],
      ["api_key: sk-live-000", "secret_not_allowed"],
      ["see http://internal.example/hook", "url_not_allowed"],
    ];
    for (const [payload, code] of cases) {
      const outcome = validateDefinition({ ...base, summary: `Queue for operations. ${payload}` });
      expect(outcome.ok, payload).toBe(false);
      expect(codes(outcome.violations), payload).toContain(code);
    }
  });

  it("refuses a connector that exists but is not approved for the workflow", async () => {
    const outcome = validateDefinition({
      ...example("refund-review.app.json"),
      connectorId: "synthetic.vendor-master.local",
    });
    expect(outcome.ok).toBe(false);
    expect(codes(outcome.violations)).toContain("connector_not_approved");
  });

  it("refuses view fields the workflow does not expose", async () => {
    const base = example("refund-review.app.json") as { view: { detailFields: string[] } };
    const outcome = validateDefinition({ ...base, view: { ...base.view, detailFields: ["iban"] } });
    expect(outcome.ok).toBe(false);
    expect(codes(outcome.violations)).toContain("field_not_available");
  });

  it("accepts the two shipped definitions", async () => {
    for (const name of ["refund-review.app.json", "vendor-bank-change-review.app.json"]) {
      const outcome = validateDefinition(example(name));
      expect(outcome.violations, name).toEqual([]);
      expect(outcome.ok).toBe(true);
    }
  });
});

describe("promotion is a platform-admin action", () => {
  const renamed = () => ({
    ...example("refund-review.app.json"),
    appId: "chargeback-review",
    title: "Chargeback review",
  });

  it("refuses promotion without a session", async () => {
    const res = await request(app).post("/api/catalog/promote").send({ definition: renamed() });
    expect(res.status).toBe(401);
    expect(loadApp(db, "chargeback-review")).toBeNull();
  });

  it("lets a maker validate but refuses promotion, and records the denial", async () => {
    const cookie = await login(MAKER);
    const check = await request(app)
      .post("/api/workshop/validate")
      .set("Cookie", cookie)
      .send({ definition: renamed() });
    expect(check.status).toBe(200);
    expect(check.body.ok).toBe(true);

    const promote = await request(app).post("/api/catalog/promote").set("Cookie", cookie).send({ definition: renamed() });
    expect(promote.status).toBe(403);
    expect(promote.body.error).toBe("forbidden_role");
    expect(loadApp(db, "chargeback-review")).toBeNull();

    const events = db
      .prepare(`SELECT actor_id, outcome, event_type FROM platform_events WHERE outcome = 'denied'`)
      .all() as Array<{ actor_id: string; event_type: string }>;
    expect(events.some((e) => e.actor_id === MAKER && e.event_type === "app.promote")).toBe(true);
  });

  it("ignores actor and role fields supplied in the promotion body", async () => {
    const cookie = await login(MAKER);
    const res = await request(app)
      .post("/api/catalog/promote")
      .set("Cookie", cookie)
      .send({ definition: renamed(), actorId: ADMIN, role: "platform_admin", actor: { role: "platform_admin" } });
    expect(res.status).toBe(403);
    expect(loadApp(db, "chargeback-review")).toBeNull();
  });

  it("promotes a renamed second refund app for a platform admin and audits it", async () => {
    const cookie = await login(ADMIN);
    const res = await request(app).post("/api/catalog/promote").set("Cookie", cookie).send({ definition: renamed() });
    expect(res.status).toBe(201);
    expect(res.body.app.version).toBe(1);
    expect(res.body.app.status).toBe("active");
    expect(res.body.note).toMatch(/locally/i);

    const entry = loadApp(db, "chargeback-review");
    expect(entry?.definition?.title).toBe("Chargeback review");

    const event = db
      .prepare(`SELECT * FROM platform_events WHERE app_id = 'chargeback-review'`)
      .get() as { outcome: string; actor_id: string; digest: string };
    expect(event.outcome).toBe("allowed");
    expect(event.actor_id).toBe(ADMIN);
    expect(event.digest).toBe(res.body.app.digest);
  });

  it("writes nothing when promotion fails validation", async () => {
    const cookie = await login(ADMIN);
    const res = await request(app)
      .post("/api/catalog/promote")
      .set("Cookie", cookie)
      .send({ definition: example("examples/unsafe-privilege-expansion.json") });
    expect(res.status).toBe(422);
    expect(res.body.violations.length).toBeGreaterThan(0);
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM app_definitions WHERE app_id = 'refund-review-plus'`).get() as {
      n: number;
    };
    expect(rows.n).toBe(0);
    expect(fs.readdirSync(appsDir).some((f) => f.includes("refund-review-plus"))).toBe(false);
  });

  it("supersedes the previous version when the same app is promoted again", async () => {
    const cookie = await login(ADMIN);
    const changed = { ...example("refund-review.app.json") } as { labels: Record<string, string> };
    changed.labels = { ...changed.labels, queueTitle: "Refund review queue (revised)" };
    const res = await request(app).post("/api/catalog/promote").set("Cookie", cookie).send({ definition: changed });
    expect(res.status).toBe(201);
    expect(res.body.app.version).toBe(2);

    const active = db
      .prepare(`SELECT version, active FROM app_definitions WHERE app_id = 'refund-review' ORDER BY version`)
      .all() as Array<{ version: number; active: number }>;
    expect(active).toEqual([
      { version: 1, active: 0 },
      { version: 2, active: 1 },
    ]);
    expect(loadApp(db, "refund-review")?.definition?.labels.queueTitle).toBe("Refund review queue (revised)");
  });
});

describe("the runtime re-validates definitions on load", () => {
  function activeFile(appId: string): string {
    const row = db
      .prepare(`SELECT source_path FROM app_definitions WHERE app_id = ? AND active = 1`)
      .get(appId) as { source_path: string };
    return row.source_path;
  }

  it("quarantines a definition edited directly on disk and refuses to run it", async () => {
    const cookie = await login(APPROVER);
    const file = activeFile("refund-review");
    const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    onDisk.capabilities = ["queue.read", "record.read", "decision.approve", "decision.reject", "audit.read"];
    onDisk.title = "Refund review (edited on disk)";
    fs.writeFileSync(file, JSON.stringify(onDisk, null, 2));

    const entry = loadApp(db, "refund-review");
    expect(entry?.status).toBe("quarantined");
    expect(codes(entry!.findings)).toContain("digest_mismatch");

    const list = await request(app).get("/api/apps/refund-review/records").set("Cookie", cookie);
    expect(list.status).toBe(409);
    expect(list.body.error).toBe("app_quarantined");

    const decide = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "should never be reachable", expectedVersion: 1 });
    expect(decide.status).toBe(409);
    expect(
      (db.prepare(`SELECT status FROM refund_requests WHERE id = 'rr_2001'`).get() as { status: string }).status,
    ).toBe("pending");
  });

  it("quarantines a definition whose file was deleted", async () => {
    fs.rmSync(activeFile("vendor-bank-change-review"));
    const entry = loadApp(db, "vendor-bank-change-review");
    expect(entry?.status).toBe("quarantined");
    expect(codes(entry!.findings)).toContain("definition_file_missing");
  });

  it("quarantines a definition that is no longer valid under current platform policy", async () => {
    const file = activeFile("refund-review");
    const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    onDisk.connectorId = "https://payments.internal.example/api";
    fs.writeFileSync(file, JSON.stringify(onDisk, null, 2));
    const entry = loadApp(db, "refund-review");
    expect(entry?.status).toBe("quarantined");
    expect(entry?.definition).toBeNull();
  });
});

describe("capabilities a definition did not request are not offered", () => {
  it("refuses record creation for an app whose definition omits record.create", async () => {
    const admin = await login(ADMIN);
    const base = example("refund-review.app.json") as { capabilities: string[] };
    const readOnly = {
      ...base,
      appId: "refund-review-readonly",
      title: "Refund review (read only)",
      capabilities: base.capabilities.filter((c) => c !== "record.create"),
    };
    const promoted = await request(app).post("/api/catalog/promote").set("Cookie", admin).send({ definition: readOnly });
    expect(promoted.status).toBe(201);

    const cookie = await login("u_req_nadia");
    const create = await request(app)
      .post("/api/apps/refund-review-readonly/records")
      .set("Cookie", cookie)
      .send({ paymentId: "pay_1001", amountCents: 500, reason: "capability not granted to this app" });
    expect(create.status).toBe(403);
    expect(create.body.error).toBe("capability_not_granted");

    const list = await request(app).get("/api/apps/refund-review-readonly/records").set("Cookie", cookie);
    expect(list.status).toBe(200);
  });

  it("does not let a platform admin decide business records just because they can promote apps", async () => {
    const cookie = await login(ADMIN);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "platform admin is not an approver", expectedVersion: 1 });
    expect(res.status).toBe(403);
    expect(
      (db.prepare(`SELECT status FROM refund_requests WHERE id = 'rr_2001'`).get() as { status: string }).status,
    ).toBe("pending");
  });

  it("refuses records reads for an app whose definition omits queue.read", async () => {
    const admin = await login(ADMIN);
    const base = example("vendor-bank-change-review.app.json") as { capabilities: string[] };
    const noQueue = {
      ...base,
      appId: "vendor-review-detail-only",
      title: "Vendor review (detail only)",
      capabilities: base.capabilities.filter((c) => c !== "queue.read"),
    };
    expect((await request(app).post("/api/catalog/promote").set("Cookie", admin).send({ definition: noQueue })).status).toBe(
      201,
    );

    const cookie = await login(APPROVER);
    const list = await request(app).get("/api/apps/vendor-review-detail-only/records").set("Cookie", cookie);
    expect(list.status).toBe(403);
    expect(list.body.error).toBe("capability_not_granted");
  });

  it("has no legacy unscoped routes left over from the source prototype", async () => {
    const cookie = await login(APPROVER);
    for (const url of ["/api/refunds", "/api/vendor-bank-changes"]) {
      const res = await request(app).get(url).set("Cookie", cookie);
      expect(res.status, url).toBe(404);
    }
    const decide = await request(app)
      .post("/api/refunds/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "legacy route should not exist", expectedVersion: 1 });
    expect(decide.status).toBe(404);
  });

  it("keeps runtime business controls even for an app that requested every capability", async () => {
    // A definition can narrow what is offered; it can never remove the
    // kernel's own controls. The viewer is refused despite decision.approve
    // being in the manifest.
    const cookie = await login(VIEWER);
    const res = await request(app)
      .post("/api/apps/refund-review/records/rr_2001/decision")
      .set("Cookie", cookie)
      .send({ decision: "approve", reason: "viewer should never decide", expectedVersion: 1 });
    expect(res.status).toBe(403);
  });
});

describe("catalog and activity surfaces", () => {
  it("exposes exactly the two shipped apps with digests and promoter", async () => {
    const cookie = await login(MAKER);
    const res = await request(app).get("/api/catalog").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.apps.map((a: { appId: string }) => a.appId).sort()).toEqual([
      "refund-review",
      "vendor-bank-change-review",
    ]);
    for (const a of res.body.apps) {
      expect(a.digest).toMatch(/^[0-9a-f]{32}$/);
      expect(a.promotedBy).toBe(ADMIN);
      expect(a.status).toBe("active");
    }
  });

  it("refuses the catalog, registry and activity without a session", async () => {
    for (const url of ["/api/catalog", "/api/platform/registry", "/api/activity", "/api/assurance"]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(401);
    }
  });

  it("reports the platform ceiling rather than anything an app asked for", async () => {
    const cookie = await login(MAKER);
    const res = await request(app).get("/api/platform/registry").set("Cookie", cookie);
    const refund = res.body.workflows.find((w: { key: string }) => w.key === "refund_review");
    expect(refund.capabilityCeiling).not.toContain("connector.admin");
    expect(refund.nonNegotiableControls.length).toBeGreaterThan(0);
  });

  it("shows denied and allowed promotion attempts in the activity feed", async () => {
    const makerCookie = await login(MAKER);
    await request(app)
      .post("/api/catalog/promote")
      .set("Cookie", makerCookie)
      .send({ definition: { ...example("refund-review.app.json"), appId: "denied-app" } });

    const res = await request(app).get("/api/activity").set("Cookie", makerCookie);
    const outcomes = res.body.platform.map((e: { outcome: string }) => e.outcome);
    expect(outcomes).toContain("denied");
    expect(outcomes).toContain("allowed");
  });

  it("reports assurance results from the recorded run only, never a hard-coded pass", async () => {
    const cookie = await login(MAKER);
    const res = await request(app).get("/api/assurance").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.productionGaps.length).toBeGreaterThan(0);
    if (!res.body.run) expect(res.body.error).toBeTruthy();
  });
});
