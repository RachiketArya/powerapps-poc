# Combined take-home package

Recommendation: **build, phased and gated**. Power Apps code apps is the named fallback at the pilot decision. This package combines the independently developed prototype with Claude's now-authorized planning materials, with corrected security and economic claims.

Open `index.html` for the rendered briefing, diagrams and ownership calculator. Local preview: http://127.0.0.1:8792/ while the server is running.

- `STORY-AND-DECISION.md`: customer story, bandwidth, data control reuse and pilot.
- `SYSTEM-DESIGN.md`: target runtime/release/fallback diagrams, data boundary, audit and owners.
- `ECONOMICS.md`: shared assumptions, optimistic/base/high-ownership scenarios, break-even formula and measurement plan.
- `OPERATING-PLAYBOOK.md`: how Ops, Devin, domain teams and Platform Engineering work together.
- `LOOM-BEAT-SHEET.md`: 4:40 demonstration plan; recording is not yet made.
- `KEY-DECISIONS.md` and `Key Decisions - Paved Road.pdf`: one-page decisions document based on the reviewed implementation.

## Build status

The new brief was sent to the existing Devin session on 29 September SGT: https://app.devin.ai/sessions/4f66161052574bdebce547e5cec59857 . Target repository: https://github.com/RachiketArya/powerapps-poc . Target branch: `codex/paved-road-portfolio`. Draft PR #1 is open: https://github.com/RachiketArya/powerapps-poc/pull/1 . Application frozen at `3435096`, followed by evidence-only `28a44c6`. No merge or cloud deployment.

Requested implementation: preserve the existing decision kernel; two custom app modules; proposed portfolio owners with planned apps clearly distinguished; server-side scope checks across list, detail, mutation, payment lookup and audit; a shared maintenance change; negative tests and browser evidence. No production SSO or Microsoft environment is available.

Delivered: two custom modules, a 13-entry proposed portfolio (11 planned), scope enforcement and shared reason validation. The third reconciliation app remains planned. Final application checks: 111 repository tests, 10 new independent probes, build/typecheck and browser rechecks. Twelve legacy probes passed on the same backend. See BUILD-REVIEW.md for exact revisions and all failures. The final Devin report gives about 25 minutes wall-clock for this extension, with active/waiting and usage splits not reliably measured.

## Provenance and timing

Discussion/design: Codex, recorded session model `gpt-6-astra`, medium reasoning effort. Claude's files were reviewed only after explicit user permission. Application implementation: Devin. The resumed session UI displays `SWE-2 Medium`; this is the observed selector, not an independently verified account of every underlying model call.

The historical prototype log reported 26 minutes for the reused kernel and 42 minutes for the following phase, with an approximately 75-minute cumulative estimate including later verification. The user disputes treating that estimate as actual build effort. Preserve the original logs and report separate implementation/test/idle components only where evidence supports them. The new phase is additional work; it does not restart the original assignment timebox. Total active research and presentation effort is not precisely measured. Nothing has been submitted to Cognition.

## Re-render

Use the bundled Python runtime with `render-briefing.py` and `render-onepager.py`. The PDF renderer asserts one page. Visually inspect the generated PDF after any substantive changes. Both documents and diagrams are local files; no external hosting or uploads are required.
