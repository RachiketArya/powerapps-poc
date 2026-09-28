# Control Room

A narrow proof that Ops can describe an internal review tool, have a coding agent write a **declarative app definition** for it, and have central platform controls stay enforced anyway.

Two apps are built and running here — **refund review** and **vendor bank-change review** — and they share one trusted kernel. Everything is synthetic and local. No payment, banking, vendor or identity system is contacted, and nothing is deployed anywhere.

## What this is and is not

| It is | It is not |
| --- | --- |
| Two working review apps on a shared kernel | A general-purpose low-code platform |
| Strictly validated JSON app definitions | An authoring model for arbitrary server code |
| A demo identity selector resolved server-side | SSO, or authentication of any kind |
| Local in-process "connectors" over synthetic SQLite data | Real integrations or a network isolation boundary |
| Append-only audit written in the same transaction as the state change | Tamper-proof storage |
| Adversarial tests of the governance boundary | Proof of business correctness |
| Two apps plus a reusable foundation | Thirteen apps. Ten more queues are plausible; they are future work, not built |

## Provenance

The decision kernel (`platform/kernel/decision-service.ts`), the two workflow domains and their test suites are ported from **Decision Desk**, the 26-minute prototype built earlier in the same evaluation by the same author: <https://github.com/RachiketArya/cognition-decision-desk> at commit `36dc774f30330b3d43e69caf53171793f56766e4`. This repository is therefore *not* an independent from-scratch build; it starts from that prototype and adds the governance layer (manifest schema, workflow registry, promotion store, catalog/workshop/activity surfaces). No other prior work was read or reused.

## Architecture

```
                     app maker (untrusted input)
                              │
                  apps/*.app.json  ── strict JSON, no code
                              │
  ┌───────────────────────────▼──────────────────────────────┐
  │ platform/  (trusted, platform-owned)                      │
  │                                                           │
  │  manifest/schema.ts    strict validation + content scan   │
  │        │               unknown field / URL / SQL / code / │
  │        │               markup / secret / capability check │
  │        ▼                                                  │
  │  manifest/store.ts     promotion (platform-admin only),   │
  │        │               immutable content file, then an    │
  │        │               atomic SQLite pointer + audit      │
  │        │               commit; re-validation on           │
  │        │               every load  ──► quarantine         │
  │        ▼                                                  │
  │  registry/index.ts     workflows, approved connectors,    │
  │        │               capability ceilings, exposed       │
  │        │               fields, non-negotiable controls    │
  │        ▼                                                  │
  │  registry/refund-review.ts                                │
  │  registry/vendor-bank-change-review.ts                    │
  │        │               server-side business rules         │
  │        ▼                                                  │
  │  kernel/decision-service.ts                               │
  │                        role check, no self-approval,      │
  │                        required reason, legal transition, │
  │                        optimistic version, idempotency    │
  │                        fingerprint, state+audit in one    │
  │                        SQLite transaction                 │
  │  server/app.ts         session-resolved actor; body       │
  │                        actor/role fields never read       │
  └───────────────────────────▲──────────────────────────────┘
                              │
                     web/  catalog · workshop · activity
```

A definition can choose labels, which exposed fields appear in the list and detail views, a registered workflow, an approved connector id and a **subset** of that workflow's capabilities. It cannot add a capability, name a connector by URL, disable audit, reason requirements or self-approval checks, or carry any executable content — those attempts are refused by the validator and the refusals are tested through the API.

## Run it

Requires Node `^22.12` (Vite 8 floor; better-sqlite3 is built for Node 22 here). `.nvmrc` pins `22.12`.

```bash
nvm install        # install the version in .nvmrc
nvm use            # 22.12
npm ci
npm run dev        # API on 127.0.0.1:8787, UI on 127.0.0.1:5173
```

The database is created and seeded on first start (`data/control-room.sqlite`), which also promotes the two definitions in `apps/` into the local catalog as v1.

```bash
npm run seed       # restore synthetic fixtures; reload the browser afterward
npm run reset      # stop the dev server first; deletes and re-creates the demo DB
npm test           # run the application and boundary tests
npm run typecheck
npm run build
npm run assure     # writes evidence/test-results.json, shown in the Activity view
```

The server refuses to start when `NODE_ENV` or `APP_ENV` looks like production, because identity here is a selector, not authentication.

## Demo identities

| Id | Role | Can |
| --- | --- | --- |
| `u_req_nadia` | requester | raise requests |
| `u_apr_theo` | approver | raise and decide (never on their own request) |
| `u_apr_mira` | approver | second approver, for separation of duties |
| `u_view_sam` | viewer | read only |
| `u_mkr_juno` | maker | draft and validate definitions; **cannot** promote |
| `u_adm_rhea` | platform_admin | promote definitions into the local catalog (oversight scope `*`) |
| `u_req_ovid` | requester | EMEA team fixture; only sees `emea-ops` records |

The selector is not authentication: anyone reaching this server can assume any identity. Roles are resolved from the demo session cookie server-side and an `actor`/`role` field in a request body is ignored everywhere. Every user also has a resource **scope** — `us-ops`, `emea-ops`, or `*` for oversight — and the server enforces it on list, detail, decision, audit and create paths: a foreign-scope record answers `404`, a foreign payment cannot be probed through a create, a created refund takes the payment's scope, and revoked or malformed scope fails closed. UI filters are not authorization.

## The three surfaces

- **Catalog** — the two promoted apps with workflow, connector, owner, version, digest and status, plus the **proposed portfolio**: 13 tools with business owner, technical owner, risk tier and lifecycle — only the two built apps are marked runnable; the rest are clearly the roadmap, not built software. A definition that fails re-validation on load shows as quarantined and its app refuses to serve.
- **Workshop** — paste or edit a definition, validate it without promoting, and (as platform admin) *activate locally*. Prefilled unsafe examples are one click away: unapproved connector URL, removed audit/unknown fields, capability outside the entitlement, markup in labels, invalid workflow. Refusals name the violated policy and the next action.
- **Activity** — promotion attempts (allowed and denied), decision events, and the last recorded `npm run assure` run read from disk. Nothing there is hard-coded green; with no recorded run it says so, and a failing run displays as failing.

## Honest limitations

See [SECURITY_BOUNDARY.md](SECURITY_BOUNDARY.md) for what is enforced, what is trusted and what a real deployment would need (branch protection, CODEOWNERS review on `platform/`, a separately controlled CI/deploy identity, network egress policy). [EVIDENCE.md](EVIDENCE.md) records the actual commands, results and timings.

Short version: identity is mock, connectors are local readers, the digest identifies content rather than authenticating an author, the audit trail is append-only through the API but not tamper-proof against whoever owns the database, and the CI workflow in `.github/workflows/` is illustrative — it does not enforce anything until repository rulesets require it.

## Structure

- `platform/` — trusted: kernel, registry, manifest validation, promotion, server. `platform/portfolio.ts` is the 13-entry proposed portfolio.
- `apps/` — untrusted manifests plus unsafe examples.
- `web/apps/` — workflow-specific modules (`refund.tsx` with the payment ledger, `vendor.tsx` with the account-compare and verification checklist) over a shared `ReviewSurface` shell and typed client; `web/` — catalog, workshop, activity.

- [OWNERSHIP.md](OWNERSHIP.md) — the app-request contract and proposed role boundaries.
- [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md) — local runtime vs target phase-gated paved road.

## Case-study deliverables

Start with [the solution and build-versus-buy recommendation](evaluation/CASE-STUDY.md). It explains the controlled authoring model, what Power Apps provides, where savings might arise and the conditions for a pilot.

- [Key decisions: one-page PDF](evaluation/Control%20Room%20-%20Key%20Decisions.pdf)
- [Loom narration and demo steps](evaluation/LOOM-SCRIPT.md)
- [Independent review and repaired defects](evaluation/INDEPENDENT-REVIEW.md)
- [Pilot scorecard](evaluation/PILOT-SCORECARD.md) and [ownership contract](evaluation/AUTHORING-CONTRACT.md)
- [Delivery, provenance and verification record](evaluation/DELIVERY.md)

Devin Cloud authored the application and its tests. Codex scoped and researched the case, orchestrated the build, performed independent review and prepared the evaluation materials. The independent probes live in evaluation/ and run with `node --import tsx evaluation/independent-probes.mjs`.

The Loom script is ready for Rachiket to review and record in his own voice. No assignment submission has been performed.
