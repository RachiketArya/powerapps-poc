/**
 * App-definition schema and validator — platform-owned, trusted code.
 *
 * Definitions are treated as untrusted input from an app maker (or from a
 * model asked to write one). They are declarative only: there is no field in
 * which code, a URL, raw SQL, markup or a secret can be carried, and anything
 * the schema does not know about is a refusal rather than an ignored extra.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { APPROVED_CONNECTORS, WORKFLOWS, type Capability } from "../registry/index.js";

export interface Violation {
  /** Stable machine code, e.g. `unknown_field`. */
  code: string;
  /** Dotted path inside the definition, or `(document)`. */
  path: string;
  /** What is wrong. */
  message: string;
  /** The platform policy that refused it. */
  policy: string;
  /** What the maker should do next. */
  nextAction: string;
}

export interface ValidationOutcome {
  ok: boolean;
  violations: Violation[];
  /** Present only when `ok`. */
  definition?: AppDefinition;
  digest?: string;
}

const LABEL = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\p{L}\p{N} .,'’()\/&·:+-]+$/u, "labels may contain text and simple punctuation only");

const ID = z.string().regex(/^[a-z][a-z0-9-]{2,48}$/, "lower-case id, letters/digits/hyphen");

const definitionSchema = z
  .object({
    manifestVersion: z.literal(1),
    appId: ID,
    title: LABEL,
    summary: z.string().min(10).max(400),
    workflow: z.string(),
    connectorId: z.string(),
    capabilities: z.array(z.string()).min(1).max(12),
    view: z
      .object({
        listFields: z.array(z.string()).min(1).max(10),
        detailFields: z.array(z.string()).min(1).max(20),
        pageSize: z.number().int().min(5).max(100).optional(),
      })
      .strict(),
    labels: z
      .object({
        queueTitle: LABEL,
        approveAction: LABEL,
        rejectAction: LABEL,
        emptyState: LABEL,
      })
      .strict(),
    owner: z
      .object({
        team: LABEL,
        contactHandle: z.string().regex(/^@[a-z0-9._-]{2,40}$/, "internal handle such as @ops-payments"),
      })
      .strict(),
    risk: z
      .object({
        tier: z.enum(["low", "medium", "high"]),
        dataClass: z.enum(["synthetic", "internal"]),
      })
      .strict(),
  })
  .strict();

export type AppDefinition = z.infer<typeof definitionSchema> & { capabilities: Capability[] };

/** Text that must never appear in any string value of a definition. */
const FORBIDDEN_CONTENT: Array<{ re: RegExp; code: string; policy: string; message: string }> = [
  {
    re: /<[a-z!\/]/i,
    code: "markup_not_allowed",
    policy: "definitions are data, never markup",
    message: "HTML or XML markup is not accepted in any field",
  },
  {
    re: /https?:\/\/|ftp:\/\/|javascript:|data:/i,
    code: "url_not_allowed",
    policy: "connectors are chosen by id from the approved list, never by URL",
    message: "URLs and URI schemes are not accepted in any field",
  },
  {
    re: /\b(select|insert|update|delete|drop|union)\b\s+[\w*]/i,
    code: "sql_not_allowed",
    policy: "definitions cannot express queries; the runtime owns all data access",
    message: "SQL-like text is not accepted in any field",
  },
  {
    re: /\bfunction\s*\(|=>|\beval\s*\(|\brequire\s*\(|\bnew\s+Function\b|process\.env/,
    code: "code_not_allowed",
    policy: "definitions are declarative; no expression or code is ever evaluated",
    message: "Executable expressions are not accepted in any field",
  },
  {
    re: /\b(secret|password|api[_-]?key|token|bearer)\b\s*[:=]/i,
    code: "secret_not_allowed",
    policy: "credentials are platform-owned and never present in an app definition",
    message: "Credential-looking content is not accepted in any field",
  },
];

function scanStrings(value: unknown, path: string, out: Violation[]): void {
  if (typeof value === "string") {
    for (const rule of FORBIDDEN_CONTENT) {
      if (rule.re.test(value)) {
        out.push({
          code: rule.code,
          path,
          message: rule.message,
          policy: rule.policy,
          nextAction: "Remove the offending text; express the intent with an approved field or connector id.",
        });
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanStrings(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) scanStrings(v, path === "" ? k : `${path}.${k}`, out);
  }
}

export function digestOf(definition: unknown): string {
  return createHash("sha256").update(canonical(definition)).digest("hex").slice(0, 32);
}

/** Stable serialisation so a digest does not depend on key order or spacing. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function validateDefinition(input: unknown): ValidationOutcome {
  const violations: Violation[] = [];

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      violations: [
        {
          code: "not_an_object",
          path: "(document)",
          message: "An app definition must be a JSON object",
          policy: "strict schema validation",
          nextAction: "Start from a catalog template in the workshop.",
        },
      ],
    };
  }

  scanStrings(input, "", violations);

  const parsed = definitionSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "(document)";
      const unknownKey = issue.code === "unrecognized_keys";
      violations.push({
        code: unknownKey ? "unknown_field" : "schema_violation",
        path: unknownKey ? `${path ? `${path}.` : ""}${(issue as { keys?: string[] }).keys?.join(", ") ?? ""}` : path,
        message: unknownKey
          ? "Field is not part of the app-definition schema and is refused rather than ignored"
          : issue.message,
        policy: unknownKey ? "unknown fields are refused, never ignored" : "strict schema validation",
        nextAction: unknownKey
          ? "Delete the field. Behaviour that is not in the schema cannot be requested by a definition."
          : "Correct the value to match the documented schema.",
      });
    }
    return { ok: false, violations };
  }

  const def = parsed.data;
  const workflow = WORKFLOWS[def.workflow];
  if (!workflow) {
    violations.push({
      code: "unknown_workflow",
      path: "workflow",
      message: `'${def.workflow}' is not a registered workflow`,
      policy: "workflows are implemented in the platform registry, not by a definition",
      nextAction: `Choose one of: ${Object.keys(WORKFLOWS).join(", ")}.`,
    });
    return { ok: false, violations };
  }

  if (!workflow.approvedConnectorIds.includes(def.connectorId)) {
    violations.push({
      code: "connector_not_approved",
      path: "connectorId",
      message: `Connector '${def.connectorId}' is not approved for workflow '${workflow.key}'`,
      policy: "connector allow-list is platform-owned",
      nextAction: `Use ${workflow.approvedConnectorIds.join(" or ")}, or ask the platform team to approve a new connector.`,
    });
  }

  const ceiling = new Set<string>(workflow.capabilityCeiling);
  for (const cap of def.capabilities) {
    if (!ceiling.has(cap)) {
      violations.push({
        code: "capability_outside_entitlement",
        path: "capabilities",
        message: `Capability '${cap}' is outside the platform entitlement ceiling for '${workflow.key}'`,
        policy: "entitlement ceilings are platform-owned; a definition may request a subset, never an extension",
        nextAction: `Remove it. The ceiling is: ${workflow.capabilityCeiling.join(", ")}.`,
      });
    }
  }
  if (new Set(def.capabilities).size !== def.capabilities.length) {
    violations.push({
      code: "duplicate_capability",
      path: "capabilities",
      message: "Capabilities must be unique",
      policy: "strict schema validation",
      nextAction: "Remove the duplicate entries.",
    });
  }

  for (const [field, list, allowed] of [
    ["view.listFields", def.view.listFields, workflow.listFields],
    ["view.detailFields", def.view.detailFields, workflow.detailFields],
  ] as const) {
    for (const f of list) {
      if (!allowed.includes(f)) {
        violations.push({
          code: "field_not_available",
          path: field,
          message: `Field '${f}' is not exposed by workflow '${workflow.key}'`,
          policy: "the runtime decides which fields exist; a definition only selects from them",
          nextAction: `Choose from: ${allowed.join(", ")}.`,
        });
      }
    }
  }

  if (violations.length > 0) return { ok: false, violations };
  const definition = def as AppDefinition;
  return { ok: true, violations: [], definition, digest: digestOf(definition) };
}

export function connectorCatalog() {
  return APPROVED_CONNECTORS;
}
