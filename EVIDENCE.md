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
| Milestone pushed for review | see commit below | — |

## Commands and results

```
$ node -v
v22.x (nvm, .nvmrc = 22.12)

$ npm ci
found 0 vulnerabilities

$ npx tsc -p tsconfig.json --noEmit
(clean, no output)

$ npx vitest run
 Test Files  3 passed (3)
      Tests  71 passed (71)

$ npm run build
✓ 19 modules transformed.
dist/web/index.html                   0.41 kB
dist/web/assets/index-C1iqe2ok.css    6.23 kB
dist/web/assets/index-Bko3Zrub.js   166.79 kB
✓ built in 101ms

$ npm audit
found 0 vulnerabilities
```

`npm run assure` writes `evidence/test-results.json`; the Activity view renders whatever that file contains, including failures, and says so when the file is absent.

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

Recorded separately after the milestone push; see the session message and recording. Nothing in the README or this file claims a browser check that has not happened.

## Known gaps

- Identity is a demo selector, not authentication.
- Connectors are in-process readers over synthetic SQLite tables, not integrations and not a network boundary.
- The digest identifies content; it does not authenticate an author. A DB or runtime owner remains trusted, and the audit trail is append-only through the API only.
- View field selection is display configuration, not field-level data permission.
- The CI workflow and CODEOWNERS file are illustrative until repository rulesets require them.
- Two apps exist. Further queues on this kernel are plausible but unbuilt.
