# Security boundary

This document separates three things that are easy to conflate: what this runtime actually enforces, what it still trusts, and what a real deployment would have to add.

## 1. Enforced by this runtime (and tested through the API)

Every item below has at least one test in `platform/**/*.test.ts` that calls the HTTP API or the store directly. Disabled buttons are never the control.

**Definition validation (`platform/manifest/schema.ts`)**

- Unknown fields are refused, not ignored. `requireAudit: false` and `bypassSelfApprovalCheck: true` are simply unknown fields, and a definition carrying them is rejected.
- Only registered workflows are accepted; only connector ids on the workflow's approved list are accepted. A URL anywhere in the document is refused.
- Capabilities are checked against the workflow's platform-owned ceiling. A definition may request a subset; a request for anything outside it is refused.
- List and detail fields must be fields the registered workflow exposes. **These are display configuration, not field-level data permissions:** they choose what the surface renders, and the API returns the workflow's record shape regardless. Do not rely on omitting a field here to hide data from a caller.
- Every string is scanned for markup, URLs/URI schemes, SQL-like text, executable expressions and credential-looking values.
- Refusals carry the violated policy and a next action, and nothing is written when validation fails.

**Promotion (`platform/manifest/store.ts`)**

- Promotion requires the `platform_admin` demo role. A maker can validate but not promote; the denial is audited.
- Catalog row, version/digest and the promotion audit event are written in one SQLite transaction, together with the definition file.
- Promotion is a *local activation* into this runtime's catalog. Nothing is deployed.

**Load-time re-validation**

- Active definitions are re-read and re-validated on every catalog/app load. A file edited directly on disk fails the digest comparison; a deleted file, unparsable JSON or a definition that no longer satisfies current policy fails too.
- A failing definition is quarantined: its app returns `409 app_quarantined` for reads and decisions. Skipping the friendly validator is therefore not a bypass.

**Capabilities are enforced server-side**

- Reads (`queue.read`, `record.read`), creates (`record.create`) and decisions (`decision.approve` / `decision.reject`) each require the capability in the active definition. A definition that narrows its capability set is enforced on direct API calls, not only by hiding buttons.
- Capabilities narrow what an app offers; they never widen what a role may do. `platform_admin` can activate an app but is not in any workflow's decision roles, so it cannot approve or reject business records.
- There are no unscoped legacy routes: all record access goes through `/api/apps/:appId/records`, so an app's constraints cannot be side-stepped by addressing the workflow directly. Payment options are `/api/apps/:appId/payments` and require `record.create` on a refund workflow.
- `audit.read` governs record history. Without it, detail, create and decision responses carry no `events` array and `/api/apps/:appId/records/:id/audit` is `403 capability_not_granted`.
- Cross-app activity (`/api/activity`) is platform oversight and is restricted to `platform_admin`. Per-record history belongs to an app that holds `audit.read`.

**Capability narrowing is a per-app surface control, not user data isolation**

Apps on the same workflow read the same records: there are no per-app or per-tenant record entitlements. Narrowing an app's capabilities constrains *that app's* surface, and it is enforced server-side for that app — but if the same user may also use a broader app on the same workflow, they reach the same data through it. Do not treat an app's capability set as a data boundary for a user.

**Runtime business controls (ported from Decision Desk)**

- No session → `401`. Viewer → `403`. Actor and role fields in request bodies are never read.
- Who may decide comes from one place: the workflow's `decisionRoles` in the platform registry. The kernel has no role of its own, and both the API and the UI read the same value, so narrowing platform policy narrows the API and not only the buttons.
- An approver cannot decide their own request, regardless of role.
- A reason is required; the vendor workflow additionally requires a 20-character approval reason and refuses approval when the only verification was an inbound email.
- Optimistic versions: a stale `expectedVersion` is refused.
- Idempotency replay is bound to entity type, entity id, actor, action, normalized reason and expected version; any other reuse of the key is `409 idempotency_conflict` and changes nothing.
- Refund approvals cannot cumulatively exceed a payment's remaining refundable balance; the reservation is re-checked inside the decision transaction.
- State change and audit event are written in the same transaction.
- Approval marks a record "approved for execution". No money moves and no bank record changes — this system has nothing to move them with.

## 2. Trusted by this runtime (not enforced)

- **Whoever owns the database or the process.** The audit trail is append-only *through the API*, not tamper-proof storage. A DB admin can rewrite any row.
- **The digest.** It is content identification, not authenticity: it tells you the file changed, not who changed it or whether they were allowed to. Authenticity requires signing with a key the app maker does not hold.
- **Identity.** The demo selector is not authentication. Anyone who can reach the server can assume any seeded identity. The server refuses to start with a production-looking `NODE_ENV`/`APP_ENV` for exactly this reason.
- **Connectors.** `synthetic.payments.local` and `synthetic.vendor-master.local` are in-process readers over seeded SQLite tables. They are an allow-list for *which adapter a definition may name*, not a network boundary and not real integrations.
- **The repository itself.** This repo does not enforce the trusted/untrusted split. Anyone who can push can edit `platform/`, and the CI workflow here is illustrative — a workflow file cannot protect a branch it lives on.
- **Arbitrary server code.** The supported authoring model is manifests. If someone writes server code instead, none of the above applies to it, and no test suite in an editable repository makes such code safe.
- **Automated checks.** They demonstrate that the boundary holds for the cases written down. They say nothing about whether a refund *should* have been approved. The Activity view shows the *last recorded* run and the source revision it was recorded against, with a stale flag when the checkout has moved on — a staleness signal, not an attestation that the run happened.

**Promotion across two stores.** Released content is written first to an immutable content-addressed file (`<appId>.<digest>.app.json`), then the active pointer and the promotion audit event are committed together in one SQLite transaction. This is safe publication, not cross-store atomicity: a failed write leaves the previous release untouched, and a failed commit leaves an orphan file nothing points at.

## 3. Required in a real deployment

1. **Branch protection on the platform repository** — no direct pushes, required review, linear history, no force-push.
2. **CODEOWNERS with required review on `platform/`, `.github/` and dependency manifests** so an app maker's pull request cannot alter the kernel, the registry, the validator or the pipeline. `apps/` can have a lighter path.
3. **A separately controlled CI/deploy identity** — the pipeline's credentials must not be obtainable by anyone who can merge an app definition, and promotion in a real system should happen from that pipeline, not from a developer's machine.
4. **Real identity** — SSO with group-derived roles, short sessions, and re-authentication for high-risk approvals.
5. **Connector credentials held by the platform** — issued per connector, never referenced or carried by a definition, with network egress policy restricting the runtime to the approved endpoints.
6. **Audit shipped out of the runtime** — append-only external store (or WORM bucket) so a runtime owner cannot quietly rewrite history.
7. **Signed definitions** — sign at promotion with a platform-held key, verify at load, so the load-time check proves authenticity and not just content identity.
8. **Separation of the promotion environment from the authoring environment**, so that "activate" is a pipeline action against an environment the maker cannot reach.

Without 1–3 in particular, the directory split in this repository is a convention, not a control.
