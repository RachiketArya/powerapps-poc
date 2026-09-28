# Loom script - Control Room

Target: about 4:30 including clicks; 527 spoken words. Record in your own voice after reviewing the final evidence. Do not spend the video navigating documents. Keep the catalog, workshop, one refund and the cost assumptions ready. Stage directions are not spoken. All data and identities are synthetic. Rehearse the clicks once before recording; do not present local activation as a cloud deployment.

## 0:00 - The decision

[Start on the catalog.]

My recommendation is to keep Power Apps for the three existing tools and run a narrow pilot for the next one.

The opportunity is a shared environment where Ops can use Devin to create workflows, while engineering owns the controls. We should test whether that makes each subsequent app cheaper to deliver and maintain before committing to a migration.

## 0:30 - What we currently buy

Power Apps gives us app creation, connectors, a data platform and managed governance. Its value includes permissions, environments and application lifecycle tooling, not just screens. It also already offers AI-assisted creation.

Replacing it means accepting responsibility for those services. With sixty engineers, spending a large share of a team's time maintaining an internal platform could erase the savings.

## 1:00 - The architecture

[Open a valid definition in the workshop.]

This prototype narrows the problem. Devin generates an app definition that selects supported fields, a workflow and an approved connection. A trusted runtime interprets it.

An Ops maker can change the experience, but cannot introduce arbitrary server code or grant new permissions. If a workflow needs a new business primitive, an engineer extends the runtime and reviews that change.

Hooks give early feedback. The important controls run again at activation and when the runtime loads the app.

## 1:35 - Attempt a bypass

[Select the forbidden-connection example and validate. Show the refusal.]

Here is a definition requesting a connection outside the approved set. It is refused. Editing the definition to turn off auditing is also unsupported.

[Show a maker unable to activate, then an admin activating a valid definition.]

Creation and activation are separate permissions. This is local activation, not a cloud deployment. In production, makers must also be unable to change the trusted runtime or release pipeline. A test file in a repository does not enforce that separation by itself. Review actually caught an audit-permission leak in the first version; Devin repaired it, and independent checks verified the fix.

## 2:15 - A useful app under those controls

[Open a self-requested refund, then switch demo identity to a different approver and record a decision.]

The refund app shares a decision service with the vendor review app. It enforces role checks, prevents self-approval, requires a reason, handles duplicate and stale requests, and records the decision with its audit event.

This identity switch is a simulation, not SSO. The connectors and records are synthetic. No money moves, no bank details change, and this audit database is not tamper-proof.

## 2:55 - The economics

[Show the three cost scenarios from the case study.]

We need to establish how much of the two-hundred-and-fifty-thousand-dollar bill can actually disappear. Premium licensing can cover unlimited apps per user, so ten new apps do not automatically mean ten more license charges.

For illustration, thirty thousand dollars of annual tooling plus eight hundred additional engineering hours at a hundred and fifty dollars is a hundred and fifty thousand dollars a year.

If we remove the entire license bill, that leaves a hundred thousand annually before migration. If only half is removable, we lose twenty-five thousand. These are assumptions to test, not a savings forecast.

## 3:45 - What happens next

I would run a two-week pilot on a low-risk workflow with a named platform owner. Measure total maker, engineering and review time for two apps, then make a policy change and exercise rollback and recovery.

Proceed if the second app substantially reuses the foundation, the controls survive attempted bypasses, and conservative ownership costs fit within verified savings or measured productivity gains.

Otherwise, keep Power Apps and use Devin to help with engineering tasks around it. The goal is faster delivery within explicit boundaries, with a responsible owner when something goes wrong.


## Recording preparation (not spoken)

1. Follow the root README using Node22 and npm ci. Run npm run seed for clean synthetic records, then npm run dev. Reload the browser and select Juno Aparicio (Ops maker).
2. Open Catalog, then Workshop. Select unapproved-connector and Validate to show the refusal. Return to refund-review.app.json, validate, and show Activate locally disabled for the maker.
3. Switch to Rhea Vanterpool (Platform admin), activate the valid definition, then open Refund review. Switch to Theo Lindqvist and open rr_2008 to show self-approval blocked. Switch to Mira Castellanos, enter “Synthetic contract credit reviewed by a different approver” and approve. Show the version and audit event.
4. For the economics portion, keep CASE-STUDY.md open at “Where savings come from”. The assumptions are illustrative; do not describe them as a customer quote or measured savings.
5. Keep the final independent review open in a spare tab if asked about tests or limitations. The Devin browser test recording is evidence, not a substitute for this client presentation.

If you need another take, reseed and reload; do not run reset against the live SQLite server. The repo is public and contains synthetic demo data. Review everything before submitting.
