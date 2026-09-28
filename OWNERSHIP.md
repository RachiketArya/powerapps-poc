# Ownership contract — how an internal app gets built here

This documents the proposed division of labour the prototype is shaped around.
Team names below are proposed roles, not real GitHub organizations or working
enforcement. Nothing in this repository actually grants or revokes access for
any real person.

## Roles

| Role | Proposed team | Owns |
| --- | --- | --- |
| Business owner | e.g. Finance Ops, Compliance Ops | The app request: what it decides, who may decide it, its risk tier, and UAT sign-off. |
| Technical owner | e.g. Payments Engineering, Treasury Engineering | The workflow adapter, connector surface and domain validation for their domain. |
| Platform engineering | Internal Platform | The decision kernel, manifest governance, promotion pipeline, demo identity, audit storage and deployment identity. |
| Devin | — | Writes manifests and workflow-specific UI modules inside the paved road; never receives production credentials. |

## Requesting a new app (the contract)

A domain team describes the app to Devin. Devin produces a manifest plus an
app-specific UI module on the paved road. The request must answer:

- **Owner**: which business team owns this decision, and which engineering
  team owns its adapter?
- **Workflow**: which trusted workflow does it ride on (`refund_review`,
  `vendor_bank_change_review`), or does it need a new one — which means a
  platform engineering change, not a manifest?
- **Data**: which approved connector and which record scope (`us-ops`,
  `emea-ops`, …) does it read and write?
- **Actions**: which of the workflow's capabilities does it actually need?
  The manifest may only *narrow* the platform entitlement ceiling, never
  exceed it.
- **Risk**: the risk tier, which the owning team asserts and platform
  engineering reviews.
- **UAT**: how the business owner verifies the queue end-to-end before it is
  promoted.

The workshop validates the manifest; a platform admin activates it. A maker
can draft and validate but cannot promote — that is the gate.

## What the shared platform guarantees (the contract the other way)

Every app on the paved road gets, without asking:

- server-side actor resolution — no body-supplied identity is trusted;
- per-user resource scope on list, detail, decision, audit and create paths;
- role checks from the registry's `decisionRoles`, one source of truth for
  UI and API;
- separation of duties, mandatory reasons (normalized length floors),
  optimistic versioning, single legal transitions;
- idempotency by full request fingerprint, not by key alone;
- atomic state + audit writes, no event edit or delete API;
- manifest revalidation on load, with quarantine on tampering;
- capabilities as per-app surface narrowing — **not** per-user data
  isolation (a second app may expose the same records to the same actor).

## Target boundaries (not implemented here)

- Branch protection + CODEOWNERS with required review so `platform/` can
  only change through platform engineering and `apps/` through domain teams.
- A separately controlled CI/deploy identity that promotes apps; makers and
  Devin hold no production credentials.
- Dev / test / prod environments as distinct deployments behind a protected
  deployment service identity.
- Network egress policy so manifest-driven code cannot make network calls.
- `CODEOWNERS` in this repo is illustrative only — no repository rulesets
  protect it yet.

## Power Apps code apps (documented fallback)

Power Apps code apps are a documented Microsoft path for the same idea —
custom code riding a governed platform. An ordinary React fixture preview is
possible locally, but Microsoft's Local Play requires a configured Power
Platform tenant, which this environment does not have. No Power Apps
integration is built, validated or claimed here.
