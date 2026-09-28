# Operating the paved road

Proposed production process. These procedures are not claims that repository protections, cloud accounts or real client teams are already configured.

## Intake: no owner, no new app

An Ops request supplies: business owner and backup; technical owner; users and record scope; the problem and expected time saved; approved data sources; permitted actions; sensitive data; acceptance examples; support hours and recovery needs; retirement criteria. An app that only needs a report should not become a privileged workflow service.

Example request: “Finance Ops needs to review refund requests in its assigned region, see payment context and remaining balance, and submit a decision with a reason. The requester cannot approve their own request. Payments Engineering owns the refund policy and integration. A region's users must not discover another region's records, including through audit and guessed IDs. Approval records a decision; payment execution stays in the existing payments service.”

## Devin's implementation contract

Work in the app directory and use versioned shared clients. Do not introduce direct privileged data access, new production credentials or undocumented connectors. Identify whether the brief needs a new privileged capability; route that change to the domain/platform owners. Build the interface, tests and docs, then submit a PR containing the brief, changed behavior, evidence, known limits and run/rollback instructions. Record human interventions, agent usage and elapsed time without excluding failed attempts.

Changes to platform policy, authentication, data contracts, CI, deployment configuration or migrations require the relevant engineering owner. Protect those paths with real enforced reviewers and restricted deployment identities. A prompt rule is guidance, not access control.

## Evidence required for an app change

- Positive workflow: an allowed user completes the intended task and sees accurate status.
- Negative workflow: another scope, a forbidden role and a direct API request cannot bypass policy.
- For writes: required reason, state/version checks, retry behavior and decision evidence are tested.
- For shared changes: the affected consumer apps pass their contract tests, not only the changed package.
- UI evidence uses synthetic data and names the tested commit. Screenshots demonstrate one execution, not exhaustive correctness.
- Failures and corrections remain in the log. Do not replace an unsuccessful first run with a claim of first-pass success.

## Release and support

Ops signs off business behavior. An engineer reviews custom code initially; sensitive workflows always retain engineering review. CI publishes a test artifact. A separate deployment identity promotes the approved artifact; makers cannot self-grant production access. The app owner receives the release and runbook. Platform incidents page Platform Engineering; incorrect financial or risk decisions page the owning domain team as well.

Record deployment commit, actor, approval, environment and result. Monitor errors, command failures, integration backlog and suspicious denial patterns. Practice restore and rollback before migrating sensitive apps. Keep normal support work and incident reserves visible in the ownership ledger.

## Training Ops over time

Start with specification, UAT, troubleshooting from the runbook and low-risk changes through Devin. After repeated successful changes, permit a trained app owner to approve designated low-risk categories while automated checks and independent production permissions remain in force. Never infer production authority from the ability to prompt an agent. Data-access changes, payment limits, approval policy, dependencies with material risk and new integrations require engineering review.

One manager overseeing four or five apps can coordinate priorities and acceptance. It does not remove each app's technical owner, backup or domain on-call responsibility. Review the portfolio quarterly and retire unused apps; inexpensive generation otherwise creates expensive maintenance sprawl.

## Scheduled maintenance, if the pilot justifies it

Use bounded agent runs to inspect dependencies, propose upgrades, run cross-app regressions and open PRs. Do not auto-merge high-impact changes. Count engineer review and correction time. Scheduling is a production recommendation here; no recurring automation has been created for the take-home.
