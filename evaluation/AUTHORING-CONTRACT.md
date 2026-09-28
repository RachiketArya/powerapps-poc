# Who can change what?

This is the proposed operating contract. The prototype demonstrates a subset locally; it does not configure production GitHub permissions, SSO or network controls.

## Ops maker and Devin

May propose an app definition, choose supported fields and actions, change plain-text labels, test synthetic fixtures and explain business acceptance criteria. May request narrower capabilities. May not grant a user a role, supply credentials, introduce executable plugins, modify a mandatory audit rule or acquire deployment access.

Definitions are proposals until an authorized owner activates them. Maker-supplied risk and owner metadata are declarations, not verified entitlements. Production review requirements must come from platform policy and data classification; changing a refund app’s risk label to low must never lower its approval requirements. If an unsupported workflow requires privileged platform work, raise that as an engineering change. Do not weaken the validator to make the app pass.

## Platform engineer

Owns the schema, workflow registry, authorization, connector implementations, trusted checks and release process. Reviews extensions as code changes with cross-app regression tests. A shared runtime change requires testing existing supported definitions, a version/compatibility policy and a rollback plan.

For production, keep trusted code and mandatory workflows in a separately controlled repository or enforce equivalent permissions. Makers must not be able to change both their app and the checks approving it. CODEOWNERS provides review routing; it must be paired with required review and controlled bypass privileges. A local hook can always be skipped by its user.

## Business owner

Owns whether the app solves the right problem and whether its rules reflect the actual process. Reviews allowed records, actions, approval authority and exception handling. A technically valid definition can still encode a wrong workflow. Neither schema validation nor AI generation can settle those questions.

## Runtime and infrastructure

Enforce identity, authorization and connector scopes independently of the browser. Keep credentials server-side. Default-deny unsupported operations. Record consequential outcomes reliably. Limit egress and resource consumption, separate environments and reject artifacts that were not released by the trusted path.

A platform vulnerability can affect every app. Budget for dependency updates, migration of old definitions, incident response and recovery tests. A shared layer trades repeated app work for a smaller but more consequential maintenance surface.

## Example maker request

“Create a read-only vendor review queue for the Ops team using the approved vendor-review workflow. Show the vendor label, request status and verification method. Use no new connector, role or action. Explain any requirement that cannot be expressed by the supported schema, and open the definition for review.”

The resulting definition should request only read capability. An attempt to invoke a decision endpoint directly must still fail even if someone adds a button in the browser. If the platform's approved entitlement includes decision capability, requesting it is still a reviewed release change; the maker's ability to write JSON is not authorization to activate it.

## Intended progression for thirteen apps

Inventory, do not assume, commonality. Read-only queues may fit the initial pattern. Reversible updates need validated write adapters. KYC decisions, refunds and feature-flag changes need domain-specific review, data access rules and operational safeguards. Do not offer them the same self-service release policy solely because their screens look similar.

Ship the narrow reusable foundation for a pilot. Add a primitive only when a concrete workflow justifies it. If every new app needs a substantial runtime extension, the reuse hypothesis has failed and a broader platform investment needs a separate business case.
