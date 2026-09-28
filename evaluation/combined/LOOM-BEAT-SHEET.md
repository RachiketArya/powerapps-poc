# Loom: build, phased and gated

Audience: client's VP of Engineering. Target 4:40, hard stop 5:00. Recording remains Rachiket's deliverable. Use only the final verified PR flows; do not narrate requested features as completed. No claim that this entire engagement fit the original timebox without a reconciled log.

## 0:00-0:30 — Recommendation

“I recommend a phased build with Devin, starting with one new internal tool. Keep Power Apps until that pilot proves we can operate the alternative economically. If owning the platform costs too much, use Devin to build Power Apps code apps instead.”

Show the recommendation and the two pilot gates: controls and ownership cost.

## 0:30-1:00 — What the licence buys

“Power Apps gives you more than screens: managed hosting, identity integration, connectors and governance. You still design your workflows and data permissions. The opportunity is to reuse your existing engineering services, have Devin build the tools and maintenance changes, and protect engineers' time for the core product.”

Show the target architecture. State that the client's existing services and data locations are discovery assumptions.

## 1:00-2:25 — Show the actual product and boundary

Show the synthetic-demo label once, plainly: “This is local synthetic data with demo identities.” Open the portfolio and name a business and technical owner. Distinguish implemented apps from illustrative roadmap entries.

Open refunds. Show the useful custom view, a legitimate decision and its audit evidence. Show a forbidden action at the API boundary: self-approval or another team's record, using the verified test evidence. Explain that hiding a button would not be enough.

Open the second app and show its distinct workflow using the same controls. Do not claim production authentication or isolation beyond the tested local boundary.

## 2:25-3:00 — How Devin scales delivery and maintenance

Show the PR's app-specific files, shared contract and actual tests. Show the real shared maintenance change and its regression coverage. Explain: “Ops owns the brief and acceptance. Devin writes the change. The domain team reviews business behavior; Platform Engineering owns production and the shared controls.”

Use recorded review/build figures only if verified; otherwise say the pilot will measure them. A passed test suite is evidence of specific checks, not a security certification.

## 3:00-3:40 — Economics and bandwidth

“The two biggest inputs are how much of the $250,000 disappears and how much human ownership remains. In an illustrative case with $200,000 removable, half an engineer across the portfolio and $31,000 of operating allowances, steady-state cost is $181,000 versus a $300,000 current baseline. That's $119,000 a year before transition costs. These are assumptions, not savings measured by this demo.”

Point to the high-ownership case: $331,000, which loses $31,000 against the assumed current baseline. Avoid reciting every number. Explain that saved engineering capacity is not necessarily a payroll reduction.

## 3:40-4:15 — The fallback and honest limits

“If the platform ownership is too high, code apps preserve custom React while Microsoft operates more of the platform. We'd still own business rules, integrations and app maintenance. We have not validated that path in a Microsoft environment.”

Show a labeled target diagram, not a fake Microsoft integration. Explain that real identity, recovery, protected deployment, external integrations and long-term ownership remain unproven.

## 4:15-4:40 — The next decision

“Run a gated pilot: validate the invoice and existing services, ship one low-risk workflow, then a second app and a maintenance change. Measure human hours, get Ops acceptance, verify security and recovery, and decide before renewal. Migrate sensitive existing workflows only after the platform earns that responsibility.”

Stop. No second summary.

## Recording preparation

Seed synthetic fixtures. Open the final PR/evidence, app and rendered briefing. Rehearse the forbidden-action and successful-decision paths against the final revision. Use screenshot/test evidence if a live API call would consume the demo. Never substitute old test counts or an old recording for claims about the new branch. Check read-aloud duration before recording.
