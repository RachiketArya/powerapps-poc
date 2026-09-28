# Economics: measure ownership, not just generation

Illustrative USD scenarios, 29 September 2026. These supersede neither actual invoices nor pilot measurements. They deliberately give Devin a strong productivity case. No assumed future Microsoft price increase is included. The stated $250,000 annual bill comes from the assignment; what can actually be removed is unknown.

## Common basis

Compare the same mature 13-app portfolio, after migration, with the same controls and service expectations. Routine changes are included in annual ownership; initial delivery of the ten new apps and migration are separate. Apply agent assistance to both custom and code-app paths.

- Loaded technical cost: $200,000 per FTE-year, assuming 1,600 productive hours ($125/hour). Planning convention, not a client payroll fact.
- Current Power Apps: $250,000 bill + 0.25 technical FTE ($50,000) = $300,000/year. Existing support effort is unmeasured.
- Code apps + Devin: $250,000 bill + 0.30 technical FTE ($60,000) + $15,000 incremental agent/testing allowance = $325,000/year. This conservative illustration does not assume code apps saves maintenance versus current apps. Agent usage could already be included elsewhere; remove overlaps.
- Custom + Devin: retained Microsoft spend + human technical ownership + $31,000/year incremental non-labor allowance ($5,000 agent usage, $6,000 hosting, $20,000 independent security/testing). These are budget allowances, not vendor quotes.
- “Ownership FTE” includes platform work AND app maintenance, PR review, corrections, deployment, integration upkeep, incident reserve and access reviews across the portfolio. It is not only one platform developer's coding time. Ops time is excluded only while assumed equal; add any difference.

## Strong-to-weak reuse scenarios

| Annual steady state | Strong reuse | Base hypothesis | High ownership |
|---|---:|---:|---:|
| Removable Microsoft spend | $250,000 | $200,000 | $150,000 |
| Retained Microsoft spend | $0 | $50,000 | $100,000 |
| Custom technical ownership | 0.25 FTE / $50,000 | 0.50 FTE / $100,000 | 1.00 FTE / $200,000 |
| Custom non-labor allowance | $31,000 | $31,000 | $31,000 |
| **Custom total** | **$81,000** | **$181,000** | **$331,000** |
| Saving versus current $300,000 | $219,000 | $119,000 | -$31,000 |
| Saving versus code apps $325,000 | $244,000 | $144,000 | -$6,000 |

These are linked scenarios, not a probability distribution. Strong reuse means the client already has suitable identity, delivery, governed APIs and operations, and Devin keeps incremental work low. Do not claim the demo establishes that case. Compare variables independently as well: low licence removal can erase gains even with fast app delivery.

At 0.5 FTE, the entire portfolio receives 800 technical hours a year, about 15.4 hours/week. That covers 13 apps AND the common foundation. It is an ambitious hypothesis worth testing, not proof that one agent eliminates operations.

In the base hypothesis, $200,000 of vendor cost disappears, but incremental technical effort versus today's assumed 0.25 FTE costs $50,000, and incremental non-labor costs $31,000. The economic gain is $119,000. Actual cash savings depend on staffing and contracts; salary-valued opportunity cost is not a cash invoice.

## The fallback threshold is not always one engineer

Let L be removable annual Microsoft spend, C be custom non-labor cost, H be code-app non-labor cost, E be loaded FTE cost and Fh be code-app ownership FTE.

Custom breaks even with code apps when:

**Custom ownership FTE = Fh + (L + H - C) / E**

With the assumptions above, the thresholds are 1.47 FTE at $250K removal, 1.22 FTE at $200K removal, and 0.97 FTE at $150K removal. Thus Claude's “close to one engineer” is a reasonable description of the high-ownership/60%-removable scenario, not a universal decision rule. If the Power Apps contract can be right-sized substantially, calculate again before deciding to build.

## Initial app delivery and transition

Track each option's hours for requirements clarification, implementation, review, corrections, integration, UAT, release and handover. Devin wall-clock and usage are additional measures, not substitutes for human hours. Do not infer production delivery costs from a seeded local demo.

For ten comparable new apps, every 10 technical hours saved per app is 100 hours, or $12,500 of capacity at the assumed rate. A 160-hour foundation consumes $20,000 before any migration; it would need more than those 100 hours of delivery savings to pay for itself without licence savings. Both figures are arithmetic examples, not estimates.

Year-one cost includes foundation/hardening, migrations, app delivery, agent usage, parallel operation, security acceptance and unavoidable renewal commitments, as well as annual run cost. Treat licence overlap consistently: if the steady-state model already includes retained licence spend, add only the temporarily retained portion that would otherwise be removed. Do not charge a second full $250K bill on top.

Payback = incremental transition investment divided by recurring monthly savings, adjusted for the actual date savings begin. Do not quote a payback period until transition effort and cancellation timing are known. The historical 2.4-year example used materially different assumptions; it must not be mixed with this model.

## What to measure in the pilot

One ledger per task: settled brief, start/end, agent usage, human specification/review/correction/UAT/deployment minutes, first-pass results, defects, rework, and services reused. Record routine support and a shared maintenance change across two apps. Keep platform and app hours separate for diagnosis, then add them for the decision. Include Ops training and changes in UAT effort. Document unobserved incident/security reserves separately.

No assumption that 13 apps multiply licence cost by 13: Microsoft's Premium pricing is per user with unlimited apps [1]. Code apps still require eligible end-user licensing [2]. External backends, storage/capacity and app code maintenance remain relevant. Verify actual terms with procurement.

[1] https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing

[2] https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview
