# Independent review of Control Room

Reviewer: Codex. Application author: Devin Cloud. Initial reviewed commit: e9af6e497593bc297c1cd8572405ca78f58e80ef.

## Baseline verification

Local Node22.22.0: npm ci succeeded; npm run assure recorded 71 tests passed, zero failed; npm run build passed TypeScript and Vite build; npm audit reported zero known vulnerabilities. Deprecation warnings remain in transitive/development dependencies. None of these results constitute production security certification.

## Findings sent to Devin for repair

1. **Declared audit capability was not enforced.** Activated a definition containing only queue.read and record.read. Direct GET /api/apps/review-no-audit/records/rr_2001 returned an events array including actor, reason and idempotency key. /api/activity returned all 15 seeded decision events to a viewer; /api/payments was also globally readable by any demo session. Requested response filtering, scoped payment/audit routes and explicit platform-admin oversight rather than an unscoped bypass.
2. **Failed file write destroyed the previous release.** Injected a failure into fs.writeFileSync that first wrote a partial JSON string and then threw. Promotion's database transaction rolled back to version 1, but the existing active file had already been overwritten. loadApp returned quarantined with definition_unparsable. Requested immutable per-release files and a database-atomic catalog pointer/audit commit, with harmless orphan handling and failure tests. Filesystem effects do not roll back with SQLite.
3. **Inherited workflow names crashed validation.** workflow=toString produced HTTP500 because the plain-object registry lookup found an inherited property then tried to read approvedConnectorIds. Requested own-property or Map lookup and unknown-workflow responses, including constructor and __proto__ cases.
4. **Assurance output was not source-bound.** The UI showed the last test-results file without a source revision match. Requested explicit staleness/last-run labeling or source binding; it must not imply proof about a later source revision.

The first three findings were reproduced through direct API/store probes, independently of the UI. They demonstrate why the platform itself needs review and why initial passing tests were insufficient. Repair verification is recorded below when complete.

## Scope limits to preserve

The app definition is the supported untrusted input; arbitrary server code is outside the model. Demo login can assume any seeded identity. There is no real user/tenant entitlement boundary between separate manifests on the same workflow, and view fields are presentation choices, not field-level authorization. Maker-supplied risk/owner metadata is descriptive; all local activations require the same demo admin role, and no risk-based deployment permission is implemented. Connectors are synthetic local adapters. DB/process owners remain trusted. Real production credentials, identity, network controls, repository protections and operational readiness are not tested by this prototype.

## Repair verification: 57f00f1

Ran evaluation/independent-probes.mjs against the repaired code. All 12 checks passed: session requirement; maker promotion denial; no event records without audit.read; non-admin global activity denial; removal of global payments; direct read-only decision denial; platform-admin business-decision denial; inherited workflow rejection; direct unsafe-promotion rejection; prior release preserved after partial file write; prior release preserved after deferred database COMMIT failure; invalid persisted schema quarantined even after recomputing its matching digest.

Browser verification on the repaired source: maker validated an approved definition but could not activate it; platform admin activated it as version 2. A connector URL was refused with both the URL policy and connector allow-list findings. Theo was blocked from deciding his own rr_2008.

Additional review requested a single server-enforced source for registry decisionRoles and cleared Activity data on identity change. Browser inspection found missing payment reference/customer labels caused by the generic renderer not mapping nested payment data. These are recorded as repair requests, not accepted results yet.

## Final functional acceptance: 21a9301

Local Node22.22.0: npm run assure recorded 90/90 passing tests; typecheck and Vite build passed; npm audit reported 0 known vulnerabilities; all 12 independent probes passed again. GitHub checks also completed successfully on 21a9301229304258235f75106f3d0668b6ee7cb3: https://github.com/RachiketArya/powerapps-poc/actions/runs/36425323094 .

The added source-of-truth regressions temporarily narrow registry decisionRoles, verify direct API denial and the same policy returned to the UI, then restore the policy. Both domain wrappers now pass the registered roles to the shared decision kernel.

Chrome acceptance on this revision confirmed the refund list/detail renders SYN-PAY-1006, the synthetic customer and $15,000 payment amount. Mira approved Theo’s rr_2008 with a reason: record version became 2, remaining refundable became $10,000, and one new approval event appeared. Activity loaded cross-app events as platform admin; switching to maker removed those events and displayed the explicit oversight restriction.

A final text correction was requested: matching HEAD alone must not be described as proof that a result covers the current working tree. This is a conservative evidence-labeling issue, not a new runtime feature.

## Remaining limits

These checks cover the identified failure modes; they do not cover all attacker inputs, arbitrary generated code, multiple production workers, filesystem durability across power loss, disaster recovery or live connectors. The release-file check proves the tested partial-write and database-commit failures preserve the old active pointer/file; it is not a distributed filesystem transaction. Shared-runtime rollout safety and data-isolation policy are still production work.

## Final copy-only revision: 8dd5f12

Compared 8dd5f1212959ddd297fd4a16d43f71a00034b9cf with 21a9301. Application code differs only by the corrected assurance sentence in web/Activity.tsx; other changes refresh recorded evidence. The sentence now explicitly says matching commits do not prove coverage of uncommitted edits. The functional acceptance above remains tied to 21a9301; the final browser recording covers the later revision.

Text scanners are heuristic and may reject benign wording; their regexes are not a general code or secret detector. The more important boundary is that supported definitions are interpreted as data and have no executable/network extension mechanism. Before a production pilot, assess maker usability and distinguish schema restrictions from heuristic feedback.

## Browser regressions after 8dd5f12

Devin’s recorded acceptance found eight passing scenarios and two failures: creating a request under the Approved filter left approved rows under a Pending label; the catalog claimed two apps after a third definition was activated. The original recording is retained as failed evidence: https://app.devin.ai/sessions/4f66161052574bdebce547e5cec59857?testRecording=07d1816a-6818-4e4a-b044-cd84d9f19116 .

Commit a1b94d1 added a list-request sequence and dynamic catalog copy. Independent Chrome verification confirmed the catalog correctly reports three apps after activating a read-only third definition. The queue issue still reproduced: rr_41efa1d5 was created with Pending detail, while the table retained approved rr_2008 and rr_2005. A sequence counter alone does not help when an old callback starts its stale-filter request after the new filter’s request. This revision is not accepted as repairing that path.

### Queue repair accepted: 38cb953

Creation and decision refreshes now increment a refresh token consumed by the current-filter effect, avoiding the stale callback. Independent Chrome checks on 38cb953 created rr_1eef8b1b from Approved: the filter became Pending, the new request appeared, and all visible table rows were pending. A second creation while already Pending, rr_2a832b99, also appeared immediately. The catalog count fix was separately accepted on a1b94d1. This is targeted regression verification, not a claim that every UI path was retested.

The final Devin recording on 38cb953 reports three of three passing: create from Approved, create while already Pending, and approval automatically removing a row from Pending. Its assertion results were inspected in the recording viewer: https://app.devin.ai/sessions/4f66161052574bdebce547e5cec59857?testRecording=f7664b44-7e21-4e8b-8821-05c2de82e144 . Final application CI passed: https://github.com/RachiketArya/powerapps-poc/actions/runs/36427299420 .
