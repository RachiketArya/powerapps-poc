import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = Database.Database;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('requester', 'approver', 'viewer', 'maker', 'platform_admin')),
  team TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  customer_label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refund_requests (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved_for_execution', 'rejected')),
  version INTEGER NOT NULL DEFAULT 1,
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  decision_reason TEXT
);

CREATE TABLE IF NOT EXISTS vendor_bank_changes (
  id TEXT PRIMARY KEY,
  vendor_name TEXT NOT NULL,
  current_masked_ref TEXT NOT NULL,
  new_masked_ref TEXT NOT NULL,
  country TEXT NOT NULL,
  verification_channel TEXT NOT NULL CHECK (verification_channel IN ('callback_to_known_number', 'inbound_email_only', 'portal_message')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved_for_execution', 'rejected')),
  version INTEGER NOT NULL DEFAULT 1,
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  decision_reason TEXT
);

CREATE TABLE IF NOT EXISTS decision_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_role TEXT NOT NULL,
  reason TEXT,
  from_status TEXT,
  to_status TEXT,
  from_version INTEGER,
  to_version INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  detail_json TEXT
);

-- Promoted app definitions. The JSON is app-maker input and is treated as
-- untrusted on every read: the digest is checked and the schema re-validated
-- before a definition is served or used.
CREATE TABLE IF NOT EXISTS app_definitions (
  app_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  digest TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  source_path TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  promoted_by TEXT NOT NULL REFERENCES users(id),
  promoted_at TEXT NOT NULL,
  PRIMARY KEY (app_id, version)
);

CREATE TABLE IF NOT EXISTS platform_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  app_id TEXT,
  app_version INTEGER,
  digest TEXT,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_events_time ON platform_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_entity ON decision_events(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refund_requests(payment_id, status);
`;

export function openDb(file: string): Db {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.exec(SCHEMA);
  return db;
}

export function defaultDbFile(): string {
  return process.env.CONTROL_ROOM_DB ?? path.resolve(process.cwd(), "data/control-room.sqlite");
}
