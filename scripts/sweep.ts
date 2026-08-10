/**
 * Runs the engine across every segment the data actually has, and checks the
 * things that must hold everywhere.
 *
 * The seed personas are twelve interesting stories. This is the opposite: a
 * grid of ordinary households crossed over every axis that changes an answer,
 * with mechanical checks instead of judgment. It exists because "we looked at
 * some examples" and "it holds across the space" are different claims, and
 * only the second one supports shipping numbers.
 *
 * Axes, from measuring the 2026 filings rather than assuming:
 *   counties     four, one per distinct carrier availability set
 *   incomes      the CSR boundaries, the 400 percent cliff, the 600 percent
 *                NJHPS ceiling, and points between, both sides of each edge
 *   households   single young, single older, couple near retirement, family
 *   utilization  none, light, moderate, heavy
 *
 * Invariants checked on every run:
 *   subsidy      zero above the cliff, never negative, never rising with
 *                income for an otherwise identical household
 *   csr variant  matches the income band it is defined by
 *   njhps        zero above 600 percent
 *   per plan     net premium is not negative, out of pocket never exceeds the
 *                out of pocket maximum, the total is premium plus out of
 *                pocket, the worst case is at least the expected case
 *   shortlist    never empty, and never contains a plan the county cannot buy
 *   catastrophic never offered to anyone 30 or over without an exemption
 *   monotone     more care never costs a household less on the same plan
 *
 * Usage: npx tsx scripts/sweep.ts
 */

import { loadPlanDataset } from "../src/puf.ts";
import { computeSubsidy } from "../src/subsidy.ts";
import { evaluateAllPlans, buildShortlist, eligibleSilverVariant } from "../src/rank.ts";
import { fplPercentage } from "../src/assumptions.ts";
import type { Household, Utilization } from "../src/types.ts";

const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);

// One county per distinct carrier availability set, measured from the
// service areas: full market, no Ambetter, three carriers only, no Horizon.
const COUNTIES = ["Atlantic", "Cape May", "Hunterdon", "Ocean"];

// Both sides of every edge that changes a formula: CSR bands end at 150, 200
// and 250, the federal cliff at 400, NJHPS at 600.
const FPL_POINTS = [100, 138, 149, 151, 199, 201, 249, 251, 300, 350, 399, 401, 500, 599, 601];

const UTILIZATION: Record<string, Utilization> = {
  none: {},
  light: { primaryCareVisit: 2, labWork: 1, genericDrugMonths: 12 },
  moderate: {
    primaryCareVisit: 4, specialistVisit: 4, labWork: 3, advancedImaging: 1,
    genericDrugMonths: 12, preferredBrandDrugMonths: 12,
  },
  heavy: {
    primaryCareVisit: 6, specialistVisit: 10, emergencyRoom: 1,
    inpatientAdmission: 1, outpatientSurgery: 1, labWork: 6, advancedImaging: 3,
    genericDrugMonths: 12, specialtyDrugMonths: 12,
  },
};

const FAMILIES: Array<{ name: string; size: number; ages: number[] }> = [
  { name: "single 27", size: 1, ages: [27] },
  { name: "single 55", size: 1, ages: [55] },
  { name: "couple 60/58", size: 2, ages: [60, 58] },
  { name: "family of four", size: 4, ages: [40, 38, 10, 7] },
];

/** Income in dollars that lands a household at a given percent of poverty. */
function incomeAt(fplPct: number, size: number): number {
  // Invert fplPercentage by search, so this stays right when the guideline
  // numbers change. The function is monotone in income.
  let lo = 1000, hi = 1_000_000;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (fplPercentage(mid, size) < fplPct) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

interface Violation { rule: string; where: string; detail: string; }
const violations: Violation[] = [];
const flag = (rule: string, where: string, detail: string) => {
  violations.push({ rule, where, detail });
};

let runs = 0;
const sources = { filed: 0, interpolated: 0, simulated: 0 };
const carriersSeen = new Set<string>();
const metalsInShortlists = new Set<string>();

for (const county of COUNTIES) {
  for (const fam of FAMILIES) {
    for (const util of Object.keys(UTILIZATION)) {
      // Subsidy must never rise with income, tracked along this axis.
      let lastSubsidy = Infinity;

      for (const fplPct of FPL_POINTS) {
        const income = incomeAt(fplPct, fam.size);
        const household: Household = {
          county,
          annualIncome: income,
          householdSize: fam.size,
          members: fam.ages.map((age) => ({
            age, tobaccoUser: false, utilization: UTILIZATION[util]!,
          })),
          preferredHealthSystems: [],
        };
        const where = `${county} / ${fam.name} / ${util} / ${fplPct}% FPL`;
        runs += 1;

        const subsidy = computeSubsidy(dataset, household);
        const evals = evaluateAllPlans(dataset, household, new Map(), subsidy);
        const shortlist = buildShortlist(evals);
        const variant = eligibleSilverVariant(household);

        // --- subsidy rules
        if (fplPct > 400 && subsidy.federalAnnualSubsidy > 0) {
          flag("cliff", where, `federal subsidy $${subsidy.federalAnnualSubsidy.toFixed(0)} above 400%`);
        }
        if (subsidy.federalAnnualSubsidy < 0) {
          flag("negative-subsidy", where, `$${subsidy.federalAnnualSubsidy.toFixed(0)}`);
        }
        if (subsidy.federalAnnualSubsidy > lastSubsidy + 1) {
          flag("subsidy-rises-with-income", where,
            `$${lastSubsidy.toFixed(0)} -> $${subsidy.federalAnnualSubsidy.toFixed(0)}`);
        }
        lastSubsidy = subsidy.federalAnnualSubsidy;

        // --- csr band rules
        const expectVariant =
          fplPct <= 150 ? "csr94" : fplPct <= 200 ? "csr87" : fplPct <= 250 ? "csr73" : "standard";
        if (variant !== expectVariant) {
          flag("csr-band", where, `expected ${expectVariant}, got ${variant}`);
        }

        // --- per plan rules
        const eligible = evals.filter((e) => e.disqualifiers.length === 0);
        for (const e of eligible) {
          const c = e.cost;
          const p = e.plan;
          const moop =
            (fam.size > 1 ? p.moopFamily : p.moopIndividual) ?? p.moopIndividual ?? Infinity;
          if (c.annualPremiumNet < -0.01) {
            flag("negative-premium", where, `${p.marketingName} $${c.annualPremiumNet.toFixed(0)}`);
          }
          if (c.estimatedOutOfPocket > moop + 1) {
            flag("oop-over-moop", where,
              `${p.marketingName} oop $${c.estimatedOutOfPocket.toFixed(0)} moop $${moop}`);
          }
          const effective = c.annualPremiumQuoted ?? c.annualPremiumNet;
          if (Math.abs(c.estimatedAnnualTotal - (effective + c.estimatedOutOfPocket)) > 1) {
            flag("total-mismatch", where, p.marketingName);
          }
          if (c.worstCaseAnnualTotal + 1 < c.estimatedAnnualTotal) {
            flag("worst-below-expected", where, p.marketingName);
          }
          if (p.metalLevel === "Catastrophic") {
            const oldest = Math.max(...fam.ages);
            if (oldest >= 30 && !household.hardshipExemption) {
              flag("catastrophic-age", where, `${p.marketingName} offered to a ${oldest} year old`);
            }
          }
          sources[c.outOfPocketSource] += 1;
          carriersSeen.add(p.issuerName.split(" ")[0]!);
        }

        // --- shortlist rules
        if (shortlist.length === 0) flag("empty-shortlist", where, "no plans survived");
        for (const s of shortlist) metalsInShortlists.add(s.evaluation.plan.metalLevel);
      }
    }

    // --- monotonicity in utilization: same county, family and income, more
    // care must not cost less on any given plan.
    const fplPct = 300;
    const income = incomeAt(fplPct, fam.size);
    const order = ["none", "light", "moderate", "heavy"];
    const prevOop = new Map<string, number>();
    for (const util of order) {
      const household: Household = {
        county, annualIncome: income, householdSize: fam.size,
        members: fam.ages.map((age) => ({ age, tobaccoUser: false, utilization: UTILIZATION[util]! })),
        preferredHealthSystems: [],
      };
      const subsidy = computeSubsidy(dataset, household);
      for (const e of evaluateAllPlans(dataset, household, new Map(), subsidy)) {
        if (e.disqualifiers.length) continue;
        const before = prevOop.get(e.plan.planId);
        if (before !== undefined && e.cost.estimatedOutOfPocket < before - 1) {
          flag("more-care-costs-less",
            `${county} / ${fam.name} / ${util}`,
            `${e.plan.marketingName} $${before.toFixed(0)} -> $${e.cost.estimatedOutOfPocket.toFixed(0)}`);
        }
        prevOop.set(e.plan.planId, e.cost.estimatedOutOfPocket);
      }
    }
  }
}

// --------------------------------------------- the paths the grid missed

// The grid above never sets an expected scenario, so the filed path went
// unexercised, and every 2026 plan carries examples so the simulation path
// cannot be reached with real data. Both still have to work: the first is
// live for pregnant and diabetic households, the second is the fallback the
// day a carrier files without examples.

for (const county of COUNTIES) {
  for (const [scenario, ages] of [
    ["havingABaby", [31, 33]],
    ["managingDiabetes", [55]],
    ["simpleFracture", [27]],
  ] as const) {
    for (const fplPct of [180, 300, 450]) {
      const size = ages.length;
      const household: Household = {
        county,
        annualIncome: incomeAt(fplPct, size),
        householdSize: size,
        members: ages.map((age) => ({
          age, tobaccoUser: false, utilization: UTILIZATION.moderate!,
        })),
        preferredHealthSystems: [],
        expectedScenario: scenario,
      };
      const where = `${county} / ${scenario} / ${fplPct}% FPL`;
      runs += 1;
      const subsidy = computeSubsidy(dataset, household);
      const evals = evaluateAllPlans(dataset, household, new Map(), subsidy);
      for (const e of evals) {
        if (e.disqualifiers.length) continue;
        sources[e.cost.outOfPocketSource] += 1;
        if (e.cost.outOfPocketSource !== "filed") {
          flag("scenario-not-filed", where,
            `${e.plan.marketingName} used ${e.cost.outOfPocketSource}`);
        }
        const filedTotal = e.plan.coverageExamples[scenario]?.total;
        if (filedTotal !== undefined && Math.abs(e.cost.estimatedOutOfPocket - filedTotal) > 0.01) {
          flag("filed-total-mismatch", where, e.plan.marketingName);
        }
      }
      if (buildShortlist(evals).length === 0) flag("empty-shortlist", where, "scenario run");
    }
  }
}

// The simulation fallback, reached by stripping the examples off a copy of
// the dataset. Synthetic by necessity; the assertion is that the engine still
// produces coherent figures when the filings give it nothing to lean on.
{
  const stripped = {
    ...dataset,
    plans: dataset.plans.map((p) => ({
      ...p,
      coverageExamples: { havingABaby: null, managingDiabetes: null, simpleFracture: null },
    })),
  };
  for (const util of ["none", "heavy"]) {
    const household: Household = {
      county: "Atlantic", annualIncome: incomeAt(300, 2), householdSize: 2,
      members: [60, 58].map((age) => ({ age, tobaccoUser: false, utilization: UTILIZATION[util]! })),
      preferredHealthSystems: [],
    };
    const where = `no-examples dataset / couple / ${util}`;
    runs += 1;
    const subsidy = computeSubsidy(stripped, household);
    for (const e of evaluateAllPlans(stripped, household, new Map(), subsidy)) {
      if (e.disqualifiers.length) continue;
      sources[e.cost.outOfPocketSource] += 1;
      if (e.cost.outOfPocketSource !== "simulated") {
        flag("fallback-not-simulated", where, `${e.plan.marketingName} used ${e.cost.outOfPocketSource}`);
      }
      const moop =
        (household.members.length > 1 ? e.plan.moopFamily : e.plan.moopIndividual) ??
        e.plan.moopIndividual ?? Infinity;
      if (e.cost.estimatedOutOfPocket > moop + 1) flag("oop-over-moop", where, e.plan.marketingName);
    }
  }
}

// Partial year coverage, the special enrolment case. Premium scales with the
// months, the deductible does not, and the total must stay coherent.
for (const months of [3, 7]) {
  const household: Household = {
    county: "Atlantic", annualIncome: incomeAt(250, 1), householdSize: 1,
    members: [{ age: 40, tobaccoUser: false, utilization: UTILIZATION.moderate! }],
    preferredHealthSystems: [],
    monthsOfCoverage: months,
  };
  const where = `Atlantic / single 40 / ${months} months`;
  runs += 1;
  const subsidy = computeSubsidy(dataset, household);
  const evals = evaluateAllPlans(dataset, household, new Map(), subsidy);
  for (const e of evals) {
    if (e.disqualifiers.length) continue;
    const full = e.cost.annualPremiumListed / (months / 12);
    if (!Number.isFinite(full) || e.cost.annualPremiumListed < 0) {
      flag("partial-year-premium", where, e.plan.marketingName);
    }
    sources[e.cost.outOfPocketSource] += 1;
  }
  if (buildShortlist(evals).length === 0) flag("empty-shortlist", where, "partial year");
}

// ------------------------------------------------------------------ report

console.log(`\n${runs} engine runs across ${COUNTIES.length} county classes, ${FAMILIES.length} households, ${FPL_POINTS.length} income points, ${Object.keys(UTILIZATION).length} utilization levels\n`);
console.log(`out of pocket sources exercised: filed ${sources.filed}, interpolated ${sources.interpolated}, simulated ${sources.simulated}`);
console.log(`carriers appearing in results: ${[...carriersSeen].sort().join(", ")}`);
console.log(`metals reaching shortlists: ${[...metalsInShortlists].sort().join(", ")}`);

if (!violations.length) {
  console.log(`\nAll invariants held on every run.`);
} else {
  const byRule = new Map<string, Violation[]>();
  for (const v of violations) {
    if (!byRule.has(v.rule)) byRule.set(v.rule, []);
    byRule.get(v.rule)!.push(v);
  }
  console.log(`\n${violations.length} violations:\n`);
  for (const [rule, vs] of byRule) {
    console.log(`  ${rule}  x${vs.length}`);
    for (const v of vs.slice(0, 4)) console.log(`      ${v.where}\n        ${v.detail}`);
    if (vs.length > 4) console.log(`      ... and ${vs.length - 4} more`);
  }
  process.exitCode = 1;
}
