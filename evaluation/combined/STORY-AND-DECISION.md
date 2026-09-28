# Build, phased and gated

Working synthesis for Rachiket's Cognition take-home. 29 September 2026. Combines the now-authorized Claude materials with the independent Codex/Devin work. New implementation evidence must be checked before submission.

## The story

The VP is buying two things today: the ability to deliver internal workflows, and a platform somebody else operates. Devin can change the cost of delivering and maintaining software. It does not transfer accountability for production to the agent.

Recommend a gated custom-build pilot using the company's existing engineering foundation. Keep Power Apps running until the alternative demonstrates acceptable controls, useful workflows and a lower total ownership cost. If platform ownership is too expensive, use Devin to build Power Apps code apps and retain Microsoft's managed platform. Do not commit all ten new tools before the pilot passes.

The proposed paved road is a reusable application template, typed service contracts, shared authorization and audit services, protected delivery workflows, and explicit owners. It is not a new drag-and-drop builder. Ops describes the workflow; Devin implements a PR; tests and accountable reviewers determine whether it ships.

## Engineering bandwidth is part of the decision

Count implementation, review, correction, integrations, releases, support, dependency work and access reviews. Devin may reduce work across all these categories, including infrastructure code and maintenance PRs. The pilot should test this broader benefit rather than assume engineers still implement everything manually.

Both options can use Devin. Both can use one shared platform team and domain owners. Thirteen apps do not require thirteen teams. On the custom path, the client takes on additional platform responsibilities; on the code-app path, Microsoft carries more of those responsibilities, but custom code and business correctness still need owners.

Capacity released to the core product is valuable. It is not automatically a payroll saving. Report avoided vendor spend separately from salary-valued capacity; do not add an invented revenue multiplier on top of the same hours. Also measure Ops effort: shifting work away from engineers does not make that work free.

## Reuse the data boundary, wherever it lives

First establish where the current apps get their data. If Dataverse already enforces suitable permissions, code apps can build on that investment, subject to testing identity and access. If the apps call properly governed company APIs, either deployment route can reuse them. If permissions exist only as hidden buttons or filters, neither route inherits a secure boundary.

Entra proves identity. It does not decide whether this person can approve this refund, read this customer's case, or see this audit event. Those checks belong at the authoritative service/data layer. A broad service-account connection must not silently turn an individual user's request into administrator access.

Dataverse has configurable role-based data permissions [1]. Its audit facilities require configuration and have separate considerations for reads/exports [2]. Neither automatically supplies every business decision event across external systems.

## What we keep and correct from the two earlier approaches

- Keep Claude's phased build, common development playbook, named platform owner and evidence attached to PRs.
- Keep the existing prototype's server-side decision controls and the record of failed tests and subsequent fixes.
- Replace the JSON-only product boundary with custom app modules using trusted services. Definitions can still describe catalog metadata and permitted capabilities.
- Replace “code review replaces DLP” with independent runtime authorization, credentials and deployment controls, plus review.
- Replace “a lint rule makes bypass impossible” with a real production process/credential boundary. Lint is useful feedback, not a sandbox.
- Replace “all React carries over” with reusable UI/domain contracts where practical. Microsoft SDK adapters, identity context, connections and deployment still require work.
- Replace a fixed “one engineer” cutoff with an explicit economic threshold that depends on removable licence spend and residual maintenance.
- Do not generalize canvas-app delegation limitations to code apps or assume the client's data resides outside Dataverse. Both require discovery.

## A pilot with a decision at the end

Proposed duration: six to eight weeks, a planning assumption rather than a delivery promise. Start with one new, low-risk workflow; do not migrate KYC first.

1. Confirm the invoice, renewal, data locations, current controls, existing cloud services, owners and baseline delivery/support effort.
2. Connect the paved road to real non-production identity and data. Configure protected delivery, threat-model boundaries, test recovery and get independent security review.
3. Deliver a second app using the same services. Make one shared maintenance change and show regression coverage across both apps. Track human effort and agent usage.
4. Have Ops perform UAT and a routine change through the PR workflow. Observe review/correction cost, adoption and escalation frequency.
5. Decide before renewal. Continue only with an accountable owner and backup, no unresolved critical/high security findings, successful access-denial and recovery checks, Ops acceptance, and positive conservative economics. Proposed productivity gate: a comparable second app uses no more than two engineer-days after a settled brief; calibrate this to complexity before the pilot.

A short pilot cannot establish three-year incident rates. Annualize observed routine effort, add an explicit incident/security reserve, and show sensitivity. If the custom route fails the ownership or security gate, validate the same workflow as a code app in a real Microsoft environment before choosing that fallback. Do not assume the fallback fits every connector or workflow.

## What a Microsoft version would look like

The same refund workbench could be a React code app: queue, transaction context, case detail, decision reason and status. A small typed adapter would call Dataverse or an approved domain API. Approval rules remain server-side. GitHub carries source review and tests; solutions and Power Platform pipelines carry the app through environments [3]. This is a target design, not a verified integration.

Microsoft publishes official starter templates [4]. Ordinary Vite fixture mode can demonstrate the frontend without a tenant. Microsoft's actual Local Play workflow requires a code-app-enabled Power Platform environment and sign-in [5]. A local mock must not be presented as evidence of Entra, Microsoft audit, Dataverse permissions or deployment working.

There is no need to spend the remaining demo effort creating a second simulated platform. The custom prototype plus a precise Microsoft architecture/fallback explanation answers the decision more credibly.

## Sources

[1] https://learn.microsoft.com/en-us/power-platform/admin/database-security

[2] https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing

[3] https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm

[4] https://github.com/microsoft/PowerAppsCodeApps

[5] https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch

Microsoft capabilities are documented; this client's configuration and economic inputs are assumptions to verify. No new platform price increases or product deprecations from the earlier drafts are needed to support this recommendation.
