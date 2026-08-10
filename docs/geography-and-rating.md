# How geography enters a premium

Written 9 August 2026, after a wrong belief about this reached both a code
comment and agent facing copy. Geography is the part of the model most likely
to be misremembered, because the true statement is a two step and the tempting
statement is a one step.

## The tempting wrong answer

> New Jersey has one rating area, so county does not affect price. County is
> only about which health systems are available.

Both halves are wrong, and the second one wrongly implies a data model.

## What is actually true

Geography plays **two separate roles**, and they are the same field in some
states and different fields in others.

**One: which plans exist for this household.** Carriers file service areas by
county. A plan not sold in Camden is not an option in Camden. This is what
`rank.ts` enforces.

**Two: which rating area sets the price.** Rating areas are collections of
counties, ZIP codes or metropolitan statistical areas, defined per state. Two
households in the same rating area pay the same filed rate for the same plan
at the same age.

These are independent. A state can have one rating area and many service
areas, which is close to New Jersey, or many of both.

## Why county still changes the money in New Jersey

This is the step that gets dropped. The federal credit is calculated from the
benchmark plan, the second lowest cost silver plan **available to that
household**, and availability is a county question. CMS determines the
benchmark per county.

So:

```
county -> which carriers may sell -> which silver plans exist
       -> second lowest cost silver -> the credit -> net premium
```

The list price of any given plan is identical statewide. What the household
actually pays is not. `subsidy.ts` gets this right in
`availableSilverBasePlans`, which filters silver plans by county before
ranking them.

A change of address within New Jersey can therefore change what someone pays
without any plan changing its price.

## What the 2026 New Jersey filing actually contains

Measured directly from `data/nj-sbe-puf-2026/NJRates05072026.csv`:

- The file declares **six** rating areas, not one.
- **Every medical plan is filed in Rating Area 1 only.** Eight of the nine
  issuers appear in Rating Area 1 and nowhere else.
- The only plans reaching areas 2 to 6 are three Horizon standalone **dental**
  products (Young Grins, Family Grins, Family Grins Plus), and their rates are
  identical in all six areas.
- Dental only plans are filtered out in `loadPlans` before anything reaches
  the engine.

So ignoring rating area produces correct premiums here. That is a fact about
this filing, not a fact about New Jersey law, and certainly not a fact about
any other state.

## The guard, and why it throws

`loadRates` keys rates on plan id with no rating area in the key. In a state
where a plan is filed at different prices per area, that leaves several rows
for the same age and `rateForAge` would return whichever was read first.

That is a wrong premium with no error, which is the worst failure mode this
codebase has, and it is exactly what would happen the first time the engine is
pointed at a state where rating areas mean something.

`assertOneRatePerAge` therefore refuses to load a file whose rates conflict
across areas. It fails hard rather than warning, because if we cannot tell
which rate applies then guessing is not an option worth having. Verified in
both directions: it passes the real 2026 file and rejects a doctored copy with
Rating Area 2 rows at a different price.

Teaching the engine rating areas properly means putting the area in the rate
key and resolving a household's area from its address, which is a real change
to `premium.ts` and the household model, not a config value.

## What changes in other states

Not all of this is parameters. Some of it is different code.

| Variation | States | Nature |
|---|---|---|
| No age rating at all (community rating) | New York, Vermont, and DC by most accounts | Behaviour. Not a different age curve, the absence of the calculation |
| Narrower age band, 2:1 rather than the federal 3:1 | New Jersey, Massachusetts | Absorbed by reading filed per age rates, so no code change |
| State specific age curves | DC, Massachusetts, Minnesota, Utah | As above, absorbed by the filing |
| Medicaid coverage gap below 100% of poverty | Non expansion states | Behaviour. Does not exist in New Jersey, so the engine has never met it |
| Tobacco surcharge prohibited | Several, including New Jersey | Parameter |
| State subsidy on top of the federal credit | New Jersey, California, Massachusetts, Washington and others | Behaviour. Four different schedules with four different shapes |
| Rating areas that actually differ in price | Most states | Behaviour, and currently guarded against rather than supported |

The engine reads per age filed rates, so age curve differences arrive in the
data for free. Community rating, the coverage gap, and real rating areas do
not.

## Sources

Primary, and the strongest evidence for the New Jersey claims, is the filing
itself: `data/nj-sbe-puf-2026/NJRates05072026.csv` and
`NJPlans05072026.csv`. The CMS pages on state specific rating areas return 403
to automated fetches, so the filing was measured rather than cited.

- CMS, Second Lowest Cost Silver Plan Technical FAQs:
  <https://www.cms.gov/cciio/resources/fact-sheets-and-faqs/downloads/second-lowest-cost-silver-plan-technical-faqs12162016.pdf>
- CMS, Plan Year 2025 QHP Choice and Premiums methodology:
  <https://www.cms.gov/files/document/2025-qhp-premiums-choice-methodology.pdf>
- Commonwealth Fund, Implementing the ACA: State Premium Rate Reforms:
  <https://www.commonwealthfund.org/sites/default/files/documents/___media_files_publications_issue_brief_2014_dec_1795_giovannelli_implementing_aca_state_premium_rate_reforms_rb_v2.pdf>
- healthinsurance.org, community rating:
  <https://www.healthinsurance.org/glossary/community-rating/>
