export type Role = "requester" | "approver" | "viewer" | "maker" | "platform_admin";

export interface DemoUser {
  id: string;
  display_name: string;
  role: Role;
  team: string;
}

export interface Actor {
  id: string;
  role: Role;
  displayName: string;
  scope: string;
}

export interface PortfolioEntry {
  appId: string;
  title: string;
  businessOwner: string;
  technicalOwner: string;
  riskTier: "low" | "medium" | "high";
  lifecycle: "demo" | "planned";
  runnable: boolean;
  workflow: string | null;
  sharedPlatform: readonly string[];
  evidence: string | null;
}

export interface Violation {
  code: string;
  path: string;
  message: string;
  policy: string;
  nextAction: string;
}

export interface AppDefinition {
  manifestVersion: 1;
  appId: string;
  title: string;
  summary: string;
  workflow: string;
  connectorId: string;
  capabilities: string[];
  view: { listFields: string[]; detailFields: string[]; pageSize?: number };
  labels: { queueTitle: string; approveAction: string; rejectAction: string; emptyState: string };
  owner: { team: string; contactHandle: string };
  risk: { tier: string; dataClass: string };
}

export interface WorkflowSpec {
  key: string;
  title: string;
  entityType: string;
  approvedConnectorIds: string[];
  capabilityCeiling: string[];
  decisionRoles: string[];
  listFields: string[];
  detailFields: string[];
  nonNegotiableControls: string[];
}

export interface CatalogApp {
  appId: string;
  version: number;
  digest: string;
  status: "active" | "quarantined";
  findings: Violation[];
  promotedBy: string;
  promotedAt: string;
  sourcePath: string | null;
  definition: AppDefinition | null;
  workflow: WorkflowSpec | null;
}

export interface DecisionEvent {
  id: string;
  action: string;
  actor_id: string;
  actor_name?: string;
  actor_role: string;
  reason: string | null;
  from_status: string | null;
  to_status: string | null;
  from_version?: number | null;
  to_version?: number | null;
  created_at: string;
  entity_type?: string;
  entity_id?: string;
}

export interface PlatformEvent {
  id: string;
  event_type: string;
  app_id: string | null;
  app_version: number | null;
  digest: string | null;
  actor_id: string;
  actor_role: string;
  outcome: "allowed" | "denied";
  detail_json: string | null;
  created_at: string;
}

export interface RecordSummary {
  id: string;
  status: string;
  version: number;
  created_at: string;
  [key: string]: unknown;
}

export interface RecordDetail extends RecordSummary {
  /** Present only when the app definition requested `audit.read`. */
  events?: DecisionEvent[];
  remaining_refundable_cents?: number;
}

export interface Payment {
  id: string;
  reference: string;
  customer_label: string;
  amount_cents: number;
  currency: string;
  captured_at: string;
  remaining_refundable_cents: number;
}

export interface AssuranceRun {
  startedAt: string | null;
  recordedAt: string;
  total: number;
  passed: number;
  failed: number;
  files: Array<{ file: string; status: string; tests: Array<{ title: string; status: string; failure?: string }> }>;
}

export interface RevisionBinding {
  recordedFor: string | null;
  current: string | null;
  uncommittedChangesWhenRecorded: boolean | null;
  stale: boolean | null;
  note: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly violations: Violation[] = [],
    readonly findings: Violation[] = [],
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error ?? "error",
      body.message ?? "Request failed",
      body.violations ?? [],
      body.findings ?? [],
    );
  }
  return body as T;
}

const qs = (params: Record<string, string>) =>
  Object.entries(params)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

export const api = {
  me: () => call<{ actor: Actor; simulated: boolean; notice: string }>("/api/me"),
  demoUsers: () => call<{ users: DemoUser[]; notice: string }>("/api/demo-users"),
  login: (userId: string) => call<{ ok: true }>("/api/session", { method: "POST", body: JSON.stringify({ userId }) }),
  logout: () => call<{ ok: true }>("/api/session", { method: "DELETE" }),

  catalog: () => call<{ apps: CatalogApp[] }>("/api/catalog"),
  portfolio: () => call<{ entries: PortfolioEntry[]; notice: string }>("/api/portfolio"),

  registry: () => call<{ workflows: WorkflowSpec[]; connectors: Array<{ id: string; title: string; description: string }>; notice: string }>(
    "/api/platform/registry",
  ),
  activity: () => call<{ platform: PlatformEvent[]; decisions: DecisionEvent[] }>("/api/activity"),
  assurance: () =>
    call<{
      run: AssuranceRun | null;
      error: string | null;
      revision: RevisionBinding;
      command: string;
      invariants: Array<{ workflow: string; control: string }>;
      productionGaps: string[];
    }>("/api/assurance"),

  templates: () =>
    call<{
      templates: Array<{ file: string; body: unknown }>;
      unsafeExamples: Array<{ file: string; body: unknown }>;
      notice: string;
    }>("/api/workshop/templates"),
  validate: (definition: unknown) =>
    call<{ ok: boolean; digest: string | null; violations: Violation[]; checkedAt: string }>(
      "/api/workshop/validate",
      { method: "POST", body: JSON.stringify({ definition }) },
    ),
  promote: (definition: unknown) =>
    call<{ app: CatalogApp; note: string }>("/api/catalog/promote", {
      method: "POST",
      body: JSON.stringify({ definition }),
    }),

  payments: (appId: string) => call<{ payments: Payment[] }>(`/api/apps/${appId}/payments`),
  records: (appId: string, params: { status: string; q: string }) =>
    call<{ records: RecordSummary[] }>(`/api/apps/${appId}/records?${qs(params)}`),
  record: (appId: string, id: string) => call<{ record: RecordDetail }>(`/api/apps/${appId}/records/${id}`),
  createRecord: (appId: string, input: unknown) =>
    call<{ record: RecordDetail }>(`/api/apps/${appId}/records`, { method: "POST", body: JSON.stringify(input) }),
  decide: (
    appId: string,
    id: string,
    input: { decision: "approve" | "reject"; reason: string; expectedVersion: number; idempotencyKey: string },
  ) =>
    call<{ record: RecordDetail; duplicate: boolean; note: string }>(`/api/apps/${appId}/records/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function formatTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending review",
  approved_for_execution: "Approved for execution",
  rejected: "Rejected",
};

const FIELD_LABELS: Record<string, string> = {
  id: "Reference",
  payment_id: "Payment",
  payment_reference: "Payment reference",
  payment_amount_cents: "Payment amount",
  payment_captured_at: "Payment captured",
  customer_label: "Customer",
  amount_cents: "Refund amount",
  reason: "Requested reason",
  status: "Status",
  requester_name: "Requested by",
  created_at: "Created",
  decided_at: "Decided",
  decider_name: "Decided by",
  decision_reason: "Decision reason",
  remaining_refundable_cents: "Remaining refundable",
  vendor_name: "Vendor",
  current_masked_ref: "Current account (masked)",
  new_masked_ref: "New account (masked)",
  country: "Country",
  verification_channel: "Verification channel",
  version: "Version",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function fieldValue(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (value === null || value === undefined || value === "") return "—";
  if (field.endsWith("_cents") && typeof value === "number") {
    const currency = record["payment_currency"];
    return formatCents(value, typeof currency === "string" ? currency : undefined);
  }
  if (field === "status" && typeof value === "string") return STATUS_LABEL[value] ?? value;
  if (field.endsWith("_at") && typeof value === "string") return formatTime(value);
  if (field === "verification_channel" && typeof value === "string") return value.replace(/_/g, " ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
