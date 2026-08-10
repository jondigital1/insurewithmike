# Research findings, 9 August 2026

Five questions, answered. The first was answered by measurement against our own
data rather than by reading, and it is the one that should change code.

## 1. The cost model, calibrated against the issuers' own answers

Every one of the 176 plan variants carries all three filed SBC coverage
examples (having a baby, managing type 2 diabetes, simple fracture). The
calibration nobody had run: feed each scenario's standardised allowed charges
through `applyCostSharing` and compare with what the issuer filed for the same
scenario. 117 standard variant comparisons:

| Metal | n | Median error | Mean error | Mean absolute error |
|---|---|---|---|---|
| Catastrophic | 6 | +$500 | +$545 | $545 |
| Expanded Bronze | 27 | +$180 | +$725 | $733 |
| Gold | 21 | -$40 | +$136 | $470 |
| Silver | 63 | +$150 | +$641 | $741 |

Positive means we overstate what the member pays. The shape is what the
calibration note in `review.ts` predicted from first principles: without copay
amounts, visits fall into the deductible at full charge, and the error
concentrates in bronze and silver where deductibles do the work. Gold, where
copays matter less, is nearly right.

Caveat: the standardised scenario totals used ($12,700 baby, $5,600 diabetes,
$2,800 fracture) are the CMS figures as commonly cited, not re-verified
against the current SBC instructions. The relative pattern across metals does
not depend on them; the absolute dollar sizes do.

What to do with it: the engine already prefers a filed example over the
simulation when the household maps to a scenario (`outOfPocketSource:
"filed"`). The finding says that preference is worth extending: the three filed
points per plan could anchor the simulation for households *between*
scenarios, interpolating on allowed charges rather than simulating from a
deductible model known to run $500 to $750 hot.

## 2. New Jersey Health Plan Savings: no published schedule exists

Confirmed directly on the GetCoveredNJ financial help page: no table of NJHPS
amounts by income, only the 600 percent ceiling and a pointer at their Shop
and Compare tool. The current approach in `subsidy.ts` (published per member
per month average, labelled an estimate, with the agent's quote named as the
real figure) is the honest best available. Two details worth keeping:

- 2026 ceiling figures moved: up to $93,900 for an individual, $192,900 for a
  family of four, roughly 600 percent of the 2026 poverty level.
- Third party analysis (xpostfactoid) reports NJHPS amounts *rise* with income
  by design, because they were sized to offset the higher applicable
  percentages at higher incomes. A flat average therefore overstates help at
  the bottom of a band and understates it at the top. If more precision is
  ever wanted, the Shop and Compare tool could be sampled at fixed incomes to
  reverse engineer the bands, which is tedious but mechanical.

The engine already knows the two load-bearing facts: the 600 ceiling, and that
NJHPS is the only help between 400 and 600 percent now the federal cliff is
back.

## 3. Open enrolment dates: the code is right

GetCoveredNJ runs 1 November to 31 January, enrol by 31 December for
1 January coverage, by 31 January for 1 February. `planyear.ts` already
states exactly this, including the note that New Jersey's window is longer
than the federal one. Nothing to change.

## 4. Machine-readable formularies exist for federal states, not for NJ

The federal exchange publishes a dedicated **Machine-Readable URL PUF** with
issuer-level URLs for machine-readable provider network and formulary JSON,
alongside the Plan Attributes PUF. This is the QHP certification requirement
doing the work: FFM issuers must publish structured network and formulary
data, and CMS indexes where it lives.

New Jersey runs its own exchange and its PUF leaves every URL column empty
(measured: `FORMULARY URL`, `PLAN BROCHURE`, `URL FOR SUMMARY OF BENEFITS
COVERAGE` are 0 of 204 filled). So the strategic picture inverts the effort:
the thirty or so federal-platform states come with structured formulary and
network data as part of the same integration, while New Jersey, our home
state, is the one requiring per-carrier manual work. Worth knowing before
treating our formulary experience here as representative of expansion cost.

## 5. Market context for the 2026 season

- Enhanced federal credits expired 31 December 2025; the 400 percent cliff is
  back (already correctly implemented in `subsidy.ts`).
- Nationally, 2026 sign-ups fell, and the 400 to 500 percent FPL group fell
  44 percent, accounting for over a quarter of the national drop despite being
  3 percent of enrolment. Average premium increase for that group where
  unsubsidised: roughly $2,900 a year.
- New Jersey gross rate change for 2026: about +16.6 percent.
- New Jersey cushions the cliff uniquely well: NJHPS continues to 600 percent
  with about $215 million committed, and around 80 percent of GetCoveredNJ
  enrollees received subsidies averaging $556 per person per month.

For Mike's book this means the clients most likely to have dropped coverage or
be shopping angrily are the 400 to 600 percent households, and they are
exactly the ones where New Jersey has state help that the national coverage
of "the subsidy cliff is back" does not mention. That is a concrete
conversation the tool can support: the engine already computes NJHPS for that
band.

## Addendum, same day: sensitivity and fragility

Run after the interpolation change landed, via `scripts/sensitivity.ts`.

**The invented prices matter in one band only.** Perturbing every assumed
allowed amount together by ±30 percent flipped the top pick in 8 of 72 trials,
and independent per category jitter flipped 41 of 720. Six of the eight global
flips are moderate utilizers. The shape makes sense: light utilizers sit near
the bottom of every plan's curve and heavy ones near the out of pocket
maximum, both insensitive to positioning, while moderate utilizers sit at the
deductible knee where the filed points are furthest apart. Within the moderate
basket, one assumption is 54 percent of the total: a brand name drug month at
$350. Verifying that single number against real claims or a drug pricing
source does more for ranking stability than refining everything else combined.

**Follow up, same day: the brand drug price was verified and raised.**
Checked against 2026 retail prices of the brands a marketplace population
fills (Eliquis $485 to $800 retail, $342 with a discount card; Jardiance $472
to $556; Trelegy $580 to $900; Xarelto and Symbicort newly genericised and
out of the tier). Point of sale allowed centres around $450 to $500, so the
$350 assumption sat at the low edge and was raised to $450. The number that
matters is point of sale allowed, which accrues to the deductible, not the
net of rebate price in industry reporting. After the correction, per category
jitter flips halved (41 to 20 of 720) and the remaining global flips moved
from the upside perturbation to the downside, both consistent with the new
value sitting mid band. The correction itself moved 1 of 60 seeded shortlist
slots and no top picks: the interpolation change had already absorbed most of
the sensitivity, which is what an anchored model is for.

**Four in ten top picks are not really picks.** Across 48 household cells, the
gap between first and second place was under $250 in 7 and under $500 in 19.
The tightest races are a $5 gap between an AmeriHealth bronze and Oscar Bronze
Classic, and Oscar's Silver Simple versus its own PCP Saver variant at $67 to
$314 across several households. Two implications. The interface should present
near ties as equivalents rather than a ranked winner, since a $45 margin is
inside any honest error bar. And the tight races are the right shortlists to
put in front of Mike first: disagreement there is expected and cheap, while
disagreement on a wide margin pick is diagnostic.

- CMS Exchange PUFs, including the Machine-Readable URL PUF:
  <https://www.cms.gov/marketplace/resources/data/public-use-files>
- GetCoveredNJ, financial help (no NJHPS schedule published):
  <https://www.nj.gov/getcoverednj/financialhelp/premiums/>
- GetCoveredNJ, enrolment windows:
  <https://www.nj.gov/getcoverednj/getstarted/buy/>
- KFF, 2026 marketplace enrolment and premiums:
  <https://www.kff.org/affordable-care-act/what-we-know-so-far-about-2026-aca-marketplace-enrollment-premiums-and-deductibles/>
- Bipartisan Policy Center on the enhanced credit expiry:
  <https://bipartisanpolicy.org/issue-brief/enhanced-premium-tax-credits-who-benefits-how-much-and-what-happens-next/>
- xpostfactoid on NJHPS design rising with income:
  <https://xpostfactoid.substack.com/p/new-jerseys-new-state-based-aca-marketplace-20-10-20>
- ACA Signups, NJ 2026 rate changes: <https://acasignups.net/rate_changes/2026/nj>
- Calibration: measured against `data/nj-sbe-puf-2026` and `data/sbc/*` in this
  repository, script equivalent to feeding `SCENARIO_ALLOWED` through
  `applyCostSharing` per plan and differencing against `coverageExamples`.
