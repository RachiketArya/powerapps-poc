# Delivery record

Repository: https://github.com/RachiketArya/powerapps-poc (public, as supplied by the user).
Devin session: https://app.devin.ai/sessions/4f66161052574bdebce547e5cec59857

## What to review

- [Case study](CASE-STUDY.md): problem, proposed solution, commercial model and recommendation.
- [Key decisions](Control%20Room%20-%20Key%20Decisions.pdf): one-page PDF, rendered and visually inspected.
- [Loom script](LOOM-SCRIPT.md): 527 spoken words plus demo directions, intended to fit within five minutes.
- [Independent review](INDEPENDENT-REVIEW.md): failures found beyond the initial passing suite, repairs and verification limits.
- [Pilot scorecard](PILOT-SCORECARD.md): proposed follow-on validation, not completed work.

## Source and verification

Initial governed implementation e9af6e4 passed 71 tests but independent review reproduced boundary failures. Devin repaired those in 57f00f1. Further review led to 21a9301, which passed 90 tests, TypeScript/Vite build, npm audit (zero known vulnerabilities), 12 independent probes and local Chrome acceptance. Later browser acceptance exposed two UI defects. The catalog count was repaired in a1b94d1; the queue refresh required a second repair in 38cb953. Independent Chrome checks accepted both fixes, including creation from Approved and creation while already Pending. Local build/typecheck also passed on 38cb953. The failed recordings and repair sequence are retained in the independent review.

GitHub checks on final application revision 38cb953: https://github.com/RachiketArya/powerapps-poc/actions/runs/36427299420 (passed: install, typecheck, 90 tests, build and dependency audit).

The application and its tests were authored by Devin. Codex authored the case-study materials and independent probes, and performed research, orchestration and review. Packaging edits to README and root lockfile name/engine metadata preserve the application and all resolved dependency versions.

## Time and observed usage

Devin reported 26 minutes for the reused Decision Desk kernel and 42 minutes for Control Room through code freeze at 38cb953: 68 minutes cumulative. Final recorded browser confirmation followed the code freeze. Allow approximately 75 minutes including that final verification rather than treating 68 as an exact end-to-end figure. Both are within the 120-minute prototype limit. This is prototype time, not a claim that research, review, writing and presentation took no additional time.

Clock discrepancy: the new brief was sent around 12:42 UTC on the observer clock; Devin reported starting at 12:33 on its environment clock. The final inactive session and recording were observed by 13:19 UTC. Do not combine timestamps from the two clocks to derive an exact duration.

The inactive Devin session displayed **$59.95** cumulative on-demand usage. It displayed $25.08 before the Control Room phase, so the observed incremental usage was **$34.87**. These are session meter readings, not production cost estimates or proof of the remaining org credit balance.

Final queue regression recording: https://app.devin.ai/sessions/4f66161052574bdebce547e5cec59857?testRecording=f7664b44-7e21-4e8b-8821-05c2de82e144 . It contains three passing scenarios. The original full recording had eight passing groups and two failures; those failures and the unsuccessful first queue repair remain documented. This browser evidence is separate from the required VP presentation.

## What is not delivered

This is a synthetic local prototype, not production software. SSO, real connectors, per-user/tenant data isolation, protected deployment, network policy, durable external audit retention and operational readiness are not implemented. A maker can draft supported JSON; arbitrary generated server code is outside the enforced model. The current repository does not separate app-maker permissions from platform-owner permissions.

The required VP-facing Loom remains to be recorded by Rachiket using the supplied script. A browser test recording is engineering evidence and is not that presentation. Review the repository and PDF, record the Loom, then submit the three deliverables through the assignment form. No submission or outbound message to Cognition has been performed.
