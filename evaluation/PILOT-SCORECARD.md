# Pilot scorecard: evidence required before migration

This is a proposed two-week client pilot, not evidence from the take-home. Record values from the client's own baseline; unset thresholds are decisions to make before starting.

## Commercial baseline

- Obtain the $250K contract breakdown, renewal date and cancellation/reduction terms.
- Identify distinct users, their actual app usage and licenses they would still need after migration.
- Separate Power Apps charges from bundled services that would remain.
- Record current engineering, administration and Ops effort on equivalent workflows.
- Inventory all ten planned apps: common primitive, new connector, data sensitivity, irreversible action, owner.

## Delivery and maintenance experiment

Select one low-risk workflow family and create two definitions from the same platform. Have a maker who did not author the runtime perform the second change using Devin.

For each app, measure maker hours, engineer implementation hours, review hours, elapsed time to accepted release, number of privileged platform changes and unresolved exceptions. Include failed attempts and review repairs. Compare with delivering the same scope in Power Apps, using actual team experience or a matched exercise.

Then perform one shared policy upgrade, one role removal, one connector failure and one rollback. Record time, app compatibility and operator understanding. Do not treat fast initial generation as a maintenance measurement.

## Required control demonstrations

- An app author cannot acquire release credentials or edit the mandatory checker.
- A direct request with no valid identity or insufficient entitlements is refused.
- A record outside the user's assigned scope is inaccessible, including exports.
- A definition cannot request an unapproved connection or execute arbitrary code.
- An allowed connector still limits operation, records and rate; it is not unrestricted access.
- A self-approval, duplicate/conflicting operation and stale decision are refused correctly.
- A consequential decision and its durable audit record succeed or fail together.
- A deprovisioned user loses access within the agreed identity propagation window.
- A failed rollout can be rolled back, and a backup can be restored within agreed objectives.
- Logs do not include secrets or unnecessarily expose regulated data.

These are production pilot requirements. Several are intentionally absent from the local take-home; see ../SECURITY_BOUNDARY.md for that distinction.

## Ownership decision

Business owner: workflow correctness, acceptance, lawful data use and operational procedure.
Platform engineer: runtime, permissions, connector contracts, deployment and patching.
Security reviewer: risk-based review and exception approval.
On-call owner: alerts, incidents and recovery.

A single person can hold multiple roles where appropriate, but responsibility cannot be assigned to Devin. The agent produces changes and assists investigations; humans own access and production outcomes.

## Go/no-go

Agree the budget and acceptance thresholds before the pilot. Proceed only if mandatory control cases pass, the second app reuses primitives without substantial privileged changes, user acceptance is achieved, and a conservative cost scenario has headroom for incidents. Keep buying if these conditions fail. A pilot may still justify delivery improvements while retaining licenses, but describe that as a productivity investment, not license savings.
