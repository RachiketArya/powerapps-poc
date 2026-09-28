# Paved-road phase: independent review

Application builder: Devin. Reviewer and acceptance-probe author: Codex. Synthetic local data only. This record preserves failures rather than reporting only the eventual successful run.

## Checkpoint 5afc9a9212d537a01f02964810b43612b326e9d1

Independent checkout: `paved-road-review/`, separate from the earlier demo. `npm ci` succeeded. The repository's full suite passed **101/101 tests** locally. That did not establish that the new scope boundary was correct.

Seven additional acceptance probes produced **2 passes / 5 failures**, representing three issues:

1. **Scope validation did not fail closed.** The helper accepted empty-to-empty and missing-to-missing scopes. An existing user whose scope was blank could create a vendor-change record with blank scope. A preliminary probe had invalid masked references and returned 400; after correcting the probe to the API's documented format, the valid request returned 201. The corrected reproduction is the finding.
2. **Oversight creation crossed data boundaries.** An admin with wildcard scope could create a refund against EMEA payment `pay_7001`. The creation path assigned the new refund to `us-ops`; an ordinary US user then received the EMEA payment's reference, customer label, amount and audit through the new record. The fix should prevent oversight-role creation or derive scope from the authorized payment, never default it to another team.
3. **Whitespace bypassed the vendor narrative length floor.** A padded reason `OK                         verified` passed the raw 20-character check but was stored normalized to `OK verified`. The shared validation should apply the same normalization before measuring length. This is a useful real maintenance change spanning the shared kernel and domain validator.

The two passing probes confirmed that a foreign payment with an excessive requested amount returned 404 without its balance, and that a changed role prevented an idempotent cached response after an earlier successful approval.

All three issues were sent to Devin with concrete reproduction details. No application implementation was modified by Codex. See `checkpoint-probes.json` for the initial results and `evaluation/independent-phase-probes.mjs` in the review checkout for the reproducible checks.

## Review implications

The demo should show that a fast agent implementation still benefits from independent acceptance tests. The economic model must include this review/correction work. Passing a growing test count does not establish production security or annual maintenance cost.

## Repair review

On `ba3d15d`, the original seven probes passed. Code inspection prompted three further degraded-row checks: when both a user and a pre-existing row had blank scope, the refund list, vendor list and payment-options queries still returned that row. The helper repair did not cover direct SQL filtering. Expanded results: **7/10 passed**. Devin repaired all three list paths and added regression tests.

On `c432d95`, local build/typecheck succeeded, the full suite passed **111/111**, all **10** new independent probes passed, and all **12** earlier independent probes passed. The later identity-reset commit `83c758d` changes only the React module key; backend test results apply to the unchanged backend. The frozen revision and final CI result are recorded below.

## Browser review

The local review instance runs on port 5174/API 8788, separately from the original demo. Observed:

- The catalog renders thirteen proposed entries, with two implemented workflows and eleven planned entries; it shows proposed business and technical owners.
- Refund review shows a payment ledger. A legitimate $25 approval updates remaining refundable from $125 to $100 and records the actor/reason in audit.
- The first ledger implementation subtracted the approved amount twice, displaying $75 as projected remaining after approval. Fixed in `c432d95`; the decided record shows $100 current remaining and no new approval projection.
- The vendor app shows current/proposed masked references and a verification checklist. An inbound-email-only approval was refused by the server.
- Switching Theo (US) to Ovid (EMEA) initially retained the previous user's queue, detail and audit. The API was correctly scoped; component state was stale. Fixed in `83c758d` by remounting the module on identity change. Rechecked US-to-EMEA: only EMEA rows remain, prior detail is cleared, and an open US creation form/payment selector is discarded.
- The browser automation selector occasionally reported a retention error because the controlled select updated after the asynchronous sign-in call. Subsequent observations confirmed the chosen identity. This tool timing behavior was not counted as an application defect.

Devin's own first targeted browser run reported **6 passed / 1 failed**, finding EUR remaining balances formatted with USD symbols in the creation form. Repaired in `3435096`; Codex independently verified Ovid's payment option and remaining-balance line both display **€2,400.00**. The failed recording remains part of the evidence; later checks do not turn it into a first-pass success.

## Frozen application and final verification

Devin froze application code at `3435096eedb71998493dd28bcf96173ffc2432be`, followed by evidence-only commit `28a44c6ace2685c6cb8f626ad3b09c4bc879d3ca`. Draft PR: https://github.com/RachiketArya/powerapps-poc/pull/1 . No merge or external deployment occurred.

At `28a44c6`, Codex reran the build (including TypeScript) and the full **111/111** suite successfully. All **10/10** new independent probes passed at that revision. The **12/12** legacy probes passed at `c432d95`; subsequent changes were confined to frontend state/currency and documentation, so that backend result remains applicable. GitHub CI on `28a44c6` also passed: https://github.com/RachiketArya/powerapps-poc/actions/runs/36464137107 . Packaging commits after this point add documents and independent acceptance probes, not application behavior.

Devin reported phase start **17:52 UTC** and freeze **18:17 UTC**, about **25 minutes wall-clock**. It explicitly reported no reliable active/waiting split and no separately measured usage for the phase. Its earlier draft evidence used 17:50 UTC and a different local-clock label; that estimate is superseded by its final report, not silently treated as precise independent timing. The extension is additional to the earlier prototype work. Human review minutes and total assignment effort were not reliably measured, so no exact productivity, two-hour compliance or annual cost claim is inferred.

Remaining limits: demo identities, synthetic integrations, local SQLite, API-level append-only audit only, coarse team scope with trusted wildcard oversight, owner metadata rather than enforced team permissions, no protected production deployment, no recovery exercise, and no Microsoft tenant validation. The third reconciliation app was deliberately left planned.
