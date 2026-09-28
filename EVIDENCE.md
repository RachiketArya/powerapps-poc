# Build evidence

Everything here is a record of commands actually run on this machine, with their real output. Where something was not verified, it says so.

## Clocks

My environment clock and the reviewer's observer clock are offset by roughly nine minutes (the reviewer observed 12:44:57 UTC while my environment reported 12:36). All times below are from **my** environment clock, and the figure that matters is elapsed duration, not wall time.

## Timings

| Phase | My clock | Elapsed |
| --- | --- | --- |
| Decision Desk prototype (source of the kernel) | 12:05 → 12:31 | 26 min |
| Control Room start | 12:33 | — |
| Kernel port, registry, validator, promotion store, seeded catalog | 12:33 → 12:46 | 13 min |
| Adversarial governance suite green (68 tests) | 12:47 | 14 min |
| Catalog / workshop / activity UI, typecheck and build green | 12:48 | 15 min |
| Milestone pushed for review (`e9af6e4`) | 12:49 | 16 min |
| Review repairs (four defects found by independent review of `e9af6e4`) | 12:50 → 12:57 | 24 min |
| Second review round (decision-role source of truth, Activity identity refresh, refund field mapping) | 12:57 → 13:02 | 29 min |

## Commands and results

```
$ node -v
v22.x (nvm, .nvmrc = 22.12)

$ npm ci
found 0 vulnerabilities

$ npx tsc -p tsconfig.json --noEmit
(clean, no output)

$ npx vitest run            # at the e9af6e4 milestone
 Test Files  3 passed (3)
      Tests  71 passed (71)

$ npm run assure            # after the first review round
 Test Files  4 passed (4)
      Tests  87 passed (87)

$ npm run assure            # after the second review round
 Test Files  4 passed (4)
      Tests  90 passed (90)

$ npm run build
✓ 19 modules transformed.
dist/web/index.html                   0.41 kB
dist/web/assets/index-C1iqe2ok.css    6.23 kB
dist/web/assets/index-Bko3Zrub.js   166.79 kB
✓ built in 101ms

$ npm audit
found 0 vulnerabilities
```

`npm run assure` records the source revision to `evidence/assurance-meta.json` and then writes `evidence/test-results.json`; the Activity view renders whatever those files contain — including failures, an absent run, and a stale flag when the checkout has moved past the revision the run was recorded against. The revision binding is a staleness signal, not proof that the run happened.

## Review repairs (found by independent review of `e9af6e4`, not initially passed)

All four were reproduced before fixing and each has a regression test in `platform/manifest/repairs.test.ts` (16 new cases, 71 → 87).

| Defect | Repair | Test |
| --- | --- | --- |
| `audit.read` declared but never enforced — record/decision responses carried `events` with actors, reasons and idempotency keys | Responses are projected: no `audit.read`, no `events`. History moved behind `GET /api/apps/:appId/records/:id/audit`, gated on `audit.read` | "withholds record history…", "withholds history from a decision response…", "returns history to an app that did request audit.read" |
| `/api/activity` returned every decision event to any session; `/api/payments` was unscoped | Cross-app activity is `platform_admin` oversight only; payments are `GET /api/apps/:appId/payments` requiring `record.create` on a refund workflow. UI updated. Documented that capability narrowing is a per-app surface control, not user data isolation | "does not expose cross-app activity to a non-admin session", "has no unscoped payments route…" |
| Promotion was not filesystem/SQLite atomic: a failed write destroyed the active file and left the app quarantined | Immutable content-addressed release files (`<appId>.<digest>.app.json`) written before the transaction; the SQLite pointer + audit commit together and the version is chosen inside an immediate transaction. A failed write changes nothing; a failed commit leaves a harmless orphan | "leaves the active release intact when the content write fails" (forced partial write + throw), "…when the catalog commit fails", "gives each release its own immutable file" |
| `workflow: "toString"` resolved through the prototype and 500ed | Registry lookup is a `Map` over a null-prototype table (`getWorkflow`), used by the validator, the server and the load path | "refuses workflow '<key>'" for `toString`, `constructor`, `__proto__`, `hasOwnProperty`; plus a persisted invalid definition whose digest was recomputed to match, proving validation is independent of the digest check |
| Assurance output had no source-revision binding | `npm run assure` records HEAD and dirty state; `/api/assurance` returns recorded vs current revision and a stale flag, rendered in Activity | "reports the recorded revision, the current revision and whether it is stale" |

## Second review round (found by independent review of `57f00f1`, not initially passed)

| Defect | Repair | Test |
| --- | --- | --- |
| The UI read `registry.workflow.decisionRoles` but the kernel hard-coded `actor.role === "approver"`, so narrowing platform policy would have changed buttons without changing API permission | `decide()` takes the allowed roles as a required argument and both domain wrappers read them from the registry at decision time; `setDecisionRoles()` is the platform-policy-change seam | "enforces a narrowed decisionRoles policy on the API, not only in the UI" (registry narrowed to `[]`, API returns 403 `forbidden_role`, record stays pending, registry endpoint and API agree), "enforces a narrowed policy on the vendor workflow too" |
| Activity fetched once on mount, so a platform admin's oversight events stayed on screen after switching to a maker identity | Activity takes `actorId`, clears platform/decision/assurance state and refetches whenever it changes, ignoring responses from a superseded identity | Typecheck plus browser acceptance (no component test harness in this repo) |
| Refund list showed em dashes for `payment_reference` and `customer_label`, and detail for `payment_amount_cents`, because the adapter returned a nested `payment` object while the registry vocabulary is flat | The refund adapter answers in the registry's field names (`payment_reference`, `customer_label`, `payment_amount_cents`, `payment_currency`, `payment_captured_at`); the nested object and the two hand-written detail rows that duplicated it are gone | "returns every declared list and detail field as a value, not a nested object" |

## Defects found by browser acceptance on `8dd5f12`

| Defect | Repair |
| --- | --- |
| Creating a record while a non-pending filter was selected left approved rows in a queue labelled "Pending review": the create handler reset the filter and then reloaded through the old `loadList` closure, whose stale-filter request started last and won | Two attempts. The first added a request sequence so a superseded response is ignored; that was not enough, because the stale request was issued *after* the new-filter one and legitimately won the sequence (confirmed still failing in the browser on `a1b94d1`). The fix is to stop reloading from the handler at all: creation and decisions bump a reload token the queue effect depends on, so the request always uses the filter current after the handler's state updates, and a reload still happens when the filter did not change. The sequence guard is kept for overlapping filter and search edits |
| The catalog intro and footer said "Two apps are built and running" / "Two apps exist here" even after a third app was activated from the workshop | The count is read from the catalog; the copy now says two queues were built and anything activated beyond them is a reconfiguration of the same two workflows |

Everything else in the acceptance pass held: populated payment fields shown once, separation of duties, viewer restrictions, reason minimums, vendor inbound-email-only refusal and callback-verified approval, maker validation with activation refused, admin activation with a new digest, Activity clearing on an identity switch, and the assurance panel showing recorded vs current revision with the stale warning.

## Test coverage by boundary

| Boundary | Where |
| --- | --- |
| No session on every platform and app route | `governance.test.ts`, `refund-review.test.ts` |
| Forged `actor` / `role` in the request body | `governance.test.ts`, `refund-review.test.ts` |
| Viewer refused a decision | `refund-review.test.ts`, `governance.test.ts` |
| Self-approval refused for an approver who raised the request | `refund-review.test.ts` |
| Stale `expectedVersion` refused | `refund-review.test.ts`, `vendor-bank-change-review.test.ts` |
| Exact idempotent replay, and 409 on any other reuse of the key | `refund-review.test.ts` (8 regression cases) |
| Refund balance cannot be over-reserved across requests on one payment | `refund-review.test.ts` |
| Vendor inbound-email-only approval refused | `vendor-bank-change-review.test.ts` |
| Unauthorized promotion (no session, maker, forged body role) | `governance.test.ts` |
| Unapproved connector id and connector-URL definitions refused | `governance.test.ts` |
| Unknown fields (`requireAudit`, `bypassSelfApprovalCheck`) refused | `governance.test.ts` |
| Capability outside the entitlement ceiling refused | `governance.test.ts` |
| Markup, SQL, executable expressions, secrets, URLs refused | `governance.test.ts` |
| Unregistered workflow and unavailable fields refused | `governance.test.ts` |
| Definition edited directly on disk → digest mismatch → quarantine → 409 on reads and decisions | `governance.test.ts` |
| Deleted definition file → quarantine | `governance.test.ts` |
| Narrowed capabilities enforced on direct API create and read | `governance.test.ts` |
| Platform admin can promote but cannot decide business records | `governance.test.ts` |
| No legacy unscoped `/api/refunds` routes remain | `governance.test.ts` |
| Nothing written when promotion fails validation | `governance.test.ts` |
| Promotion supersedes the prior version and audits both outcomes | `governance.test.ts` |

## Bug found by these tests

The forbidden-content scanner's executable-expression rule was written as `/\b(function\s*\(|=>|…)/`. The leading `\b` prevented the `=>` alternative from ever matching after whitespace, so an arrow function in a label would have passed the scan. Caught by the "executable code, SQL and secret-looking values" case and fixed before the milestone.

## Browser verification

Performed in Chrome against the local dev servers with synthetic data; recordings and screenshots are attached to the session.

- Full acceptance pass on `8dd5f12`: eight scenario groups passed, two failed (the queue and catalog defects above).
- Targeted recheck on `a1b94d1`: the catalog copy passed; the queue defect reproduced again, so the first repair was wrong and was replaced.
- Targeted recheck of the queue path on the final revision, reported with the same honesty as the failures.

Nothing in the README or this file claims a browser check that has not happened.

## Known gaps

- Identity is a demo selector, not authentication.
- Connectors are in-process readers over synthetic SQLite tables, not integrations and not a network boundary.
- The digest identifies content; it does not authenticate an author. A DB or runtime owner remains trusted, and the audit trail is append-only through the API only.
- View field selection is display configuration, not field-level data permission.
- The CI workflow and CODEOWNERS file are illustrative until repository rulesets require them.
- Two apps exist. Further queues on this kernel are plausible but unbuilt.

## Phase 2 — paved-road portfolio (branch `codex/paved-road-portfolio`)

Devin's final report gives approximately 17:52–18:17 UTC (25 minutes wall-clock) for this extension. No reliable active-versus-waiting or usage split was available. This supersedes the earlier start estimate and does not reset the assignment's cumulative timebox.

### Scope checkpoint `5afc9a9212d537a01f02964810b43612b326e9d1`

Per-user resource scope: `scope` column on users, payments, `refund_requests` and `vendor_bank_changes` (`us-ops`, `emea-ops`, `*` oversight), resolved into the actor server-side. Lists filter by scope; detail, audit, decision and create return 404 for foreign-scope records so a guessed id discloses nothing; the scope check precedes the idempotent replay lookup so revoked access gets 404, not a cached result; creates refuse foreign payments before balance validation. `platform/registry/scope.test.ts` adds the negative API tests. The checkpoint suite was 101/101 green — with the independent-failure distinction below preserved.

**Independent review of the checkpoint found three initial boundary bugs and an incomplete first repair; all were repaired and regressed:**

| Defect on `5afc9a9` (green suite at the time) | Repair |
| --- | --- |
| `scopeAllows({scope:""}, "")` and `scopeAllows({}, undefined)` matched; an empty-scope user could also POST a valid vendor record and get 201 | `scopeAllows` fails closed for ordinary scoped actors with empty/missing actor or record scopes, and both create paths refuse actors without a real team scope |
| `*` oversight could POST a refund against an EMEA payment, and the record was stamped `us-ops`, exposing foreign payment detail to the US queue | `*` oversight can no longer create business records at all, and a created refund derives its scope from the authorized payment, never the caller |
| Vendor approval reason `OK` + 25 spaces + `verified` passed the 20-char floor because the floor measured raw input while the kernel stored the normalized reason | Shared `assertReasonLength` (the phase's shared-maintenance change, reused by the kernel's 5-char floor and the vendor 20-char floor) measures the whitespace-normalized reason |
| Blank-scope rows still matched a blank-scope actor on the list and payment-option paths (`WHERE scope = ?` alone), so a degraded record leaked to a degraded user | Empty actor scope now returns an empty result on refund/vendor lists and payment options outright; degraded blank-scope rows are invisible to everyone except the trusted `*` oversight read path |

### Module split and portfolio

- `web/AppSurface.tsx` became a shared `ReviewSurface` shell (`web/apps/shared.tsx`) plus genuinely workflow-specific modules: `web/apps/refund.tsx` (payment-ledger inspection: captured, remaining, this request, projected remaining after approval) and `web/apps/vendor.tsx` (side-by-side masked-ref compare card plus a verification checklist). Dispatch is by the workflow's entity type — a manifest cannot pick a module the platform did not write.
- `platform/portfolio.ts` + `GET /api/portfolio` + the Catalog's "Proposed portfolio" table: exactly 13 entries with business owner, technical owner, risk tier and lifecycle. Only `refund-review` and `vendor-bank-change-review` are marked runnable; KYC, feature-flag admin and the rest are explicitly planned roadmap. No fabricated health, telemetry or test counts.
- Docs: `OWNERSHIP.md` (app-request contract, role table, target boundaries, Power Apps code-apps fallback honestly scoped), `SYSTEM-DESIGN.md` (Mermaid: local runtime vs target phase-gated design), README structure/portfolio/scope sections, SECURITY_BOUNDARY scope section.

### Verification on this branch

- `npm run typecheck` — clean
- `npm test` — 111/111 (15 + 6 scope/boundary regressions)
- `npm run build` — clean
- `npm audit` — 0 vulnerabilities
- Browser inspection on `83c758d` (recording attached): portfolio table (13 rows, 2 Runnable / 11 Planned), refund payment-ledger card with real values, vendor compare card + verification checklist with the inbound-email denial, Mira approving vbc_3001 with queue refresh, and the US↔EMEA identity switch clearing queue, detail and open create form. The initial targeted browser run reported six passes and one failure (EUR formatting); the follow-up verified its repair. Across independent and builder browser review, these three UI defects were repaired:

| Defect | Repair |
| --- | --- |
| Switching demo identity left the previous actor's queue, detail and create-form state on screen while the API enforced scope correctly | `AppModule` is keyed on the actor, so an identity switch remounts and clears all component state (`83c758d`) |
| The "Remaining after approval" projection stayed visible on a decided record and read stale by the request's amount (rr_2001 showed $75 instead of $100) | The projection row renders only while the record is pending (`c432d95`) |
| The refund create form formatted remaining-refundable amounts without `payment.currency`, showing `$` for the EUR payment | Both formatters now pass the payment currency; verified `€2,400.00 refundable` as Ovid (`3435096`) |

### Final phase-2 revision

`3435096eedb71998493dd28bcf96173ffc2432be` — draft PR #1. Freeze: no further feature work on this branch.

### Phase-2 known gaps

- The read-only reconciliation app was not built; it remains a planned portfolio entry rather than a superficial third runnable.
- Scope is a coarse team boundary, not row-level multi-tenancy; `*` is an oversight carve-out mapped to a supervised role in a real deployment.
- `CODEOWNERS`, CI and the dev/test/prod deployment identity remain illustrative/target-design, as documented in OWNERSHIP.md.
- Team names are proposed roles, not real GitHub organizations.
