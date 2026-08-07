/**
 * End to end proof: take a household, price all 39 New Jersey individual
 * medical plans against their reported utilisation, and produce the
 * good / better / best shortlist an agent would review.
 */

import { loadPlanDataset } from "../src/puf.ts";
import { evaluateAllPlans, buildShortlist, eligibleSilverVariant } from "../src/rank.ts";
import { allowedChargesByCategory } from "../src/cost.ts";
import { computeSubsidy, njHealthPlanSavings } from "../src/subsidy.ts";
import { CATEGORY_LABELS, fplPercentage, federalPovertyLevel } from "../src/assumptions.ts";
import type { Household } from "../src/types.ts";

const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// A southern New Jersey family of four. Two parents in their forties, two
// children. Moderate utilisation: routine care, one child in therapy, one
// parent on a maintenance brand drug.
const household: Household = {
  county: "Gloucester",
  annualIncome: 96000,
  householdSize: 4,
  preferredHealthSystems: ["Jefferson", "Inspira"],
  perceivedAnnualSpend: 4000,
  members: [
    {
      age: 44,
      tobaccoUser: false,
      utilization: {
        primaryCareVisit: 3,
        specialistVisit: 2,
        labWork: 4,
        preferredBrandDrugMonths: 12,
      },
    },
    {
      age: 42,
      tobaccoUser: false,
      utilization: { primaryCareVisit: 2, specialistVisit: 1, labWork: 2, genericDrugMonths: 12 },
    },
    {
      age: 14,
      tobaccoUser: false,
      utilization: { primaryCareVisit: 2, mentalHealthVisit: 20, urgentCare: 1 },
    },
    { age: 9, tobaccoUser: false, utilization: { primaryCareVisit: 2, urgentCare: 1 } },
  ],
};

console.log("=".repeat(84));
console.log("NEW JERSEY INDIVIDUAL MARKETPLACE, PLAN YEAR 2026");
console.log("=".repeat(84));

console.log(`\nPlans loaded          ${dataset.plans.length} variants`);
console.log(
  `Base plans            ${new Set(dataset.plans.map((p) => p.standardComponentId)).size}`,
);
console.log(`Carriers              ${new Set(dataset.plans.map((p) => p.issuerId)).size}`);

const fplPct = fplPercentage(household.annualIncome, household.householdSize);
console.log("\n" + "-".repeat(84));
console.log("HOUSEHOLD");
console.log("-".repeat(84));
console.log(`County                ${household.county}`);
console.log(`Household size        ${household.householdSize}`);
console.log(`Income                ${usd(household.annualIncome)}`);
console.log(
  `Federal poverty level ${usd(federalPovertyLevel(household.householdSize))}  (${fplPct.toFixed(0)}% of FPL)`,
);
console.log(`Silver variant        ${eligibleSilverVariant(household)}`);
console.log(`Wants to keep         ${household.preferredHealthSystems.join(", ")}`);

const subsidy = computeSubsidy(dataset, household);
console.log("\n" + "-".repeat(84));
console.log("SUBSIDY");
console.log("-".repeat(84));
console.log(
  `Applicable percentage ${subsidy.applicablePercentage === null ? "none, over the cliff" : `${(subsidy.applicablePercentage * 100).toFixed(2)}% of income`}`,
);
console.log(
  `Expected contribution ${subsidy.expectedAnnualContribution === null ? "n/a" : `${usd(subsidy.expectedAnnualContribution)}/yr`}`,
);
console.log(
  `Benchmark plan        ${subsidy.benchmarkPlan ? `${subsidy.benchmarkPlan.issuerName} ${subsidy.benchmarkPlan.marketingName}` : "none"}`,
);
console.log(
  `Benchmark premium     ${subsidy.benchmarkAnnualPremium === null ? "n/a" : `${usd(subsidy.benchmarkAnnualPremium)}/yr`}`,
);
console.log(`Federal credit        ${usd(subsidy.federalAnnualSubsidy)}/yr`);
for (const n of subsidy.notes) console.log(`  note: ${n}`);
const njhps = njHealthPlanSavings(household);
console.log(`  note: ${njhps.note}`);

console.log("\nReported utilisation:");
const charges = allowedChargesByCategory(household);
for (const c of charges) {
  console.log(
    `  ${CATEGORY_LABELS[c.category].padEnd(38)} ${String(c.units).padStart(3)}   ${usd(c.allowed).padStart(10)}`,
  );
}
console.log(
  `  ${"TOTAL ESTIMATED ALLOWED CHARGES".padEnd(38)}       ${usd(charges.reduce((s, c) => s + c.allowed, 0)).padStart(10)}`,
);

const evaluations = evaluateAllPlans(dataset, household, new Map(), subsidy);
const eligible = evaluations.filter((e) => e.disqualifiers.length === 0);

console.log("\n" + "-".repeat(84));
console.log(`ALL PLANS PRICED: ${evaluations.length} evaluated, ${eligible.length} eligible`);
console.log("-".repeat(84));

const sorted = [...eligible].sort(
  (a, b) => a.cost.estimatedAnnualTotal - b.cost.estimatedAnnualTotal,
);

console.log(
  `\n${"CARRIER".padEnd(10)} ${"PLAN".padEnd(34)} ${"METAL".padEnd(16)} ${"LIST/YR".padStart(9)} ${"NET/YR".padStart(9)} ${"OOP".padStart(9)} ${"TOTAL".padStart(9)} ${"WORST".padStart(9)}`,
);
for (const e of sorted) {
  const carrier = e.plan.issuerName.split(" ")[0] ?? "";
  console.log(
    `${carrier.slice(0, 9).padEnd(10)} ${e.plan.marketingName.slice(0, 33).padEnd(34)} ${e.plan.metalLevel.padEnd(16)} ${usd(e.cost.annualPremiumListed).padStart(9)} ${usd(e.cost.annualPremiumNet).padStart(9)} ${usd(e.cost.estimatedOutOfPocket).padStart(9)} ${usd(e.cost.estimatedAnnualTotal).padStart(9)} ${usd(e.cost.worstCaseAnnualTotal).padStart(9)}`,
  );
}

console.log("\n" + "=".repeat(84));
console.log("SHORTLIST FOR THE AGENT");
console.log("=".repeat(84));

for (const pick of buildShortlist(evaluations)) {
  const { plan, cost, notes } = pick.evaluation;
  console.log(`\n[${pick.tier.toUpperCase()}]  ${pick.label}`);
  console.log(`  ${plan.metalLevel}, ${plan.planType}, network ${plan.networkId}`);
  console.log(`  ${pick.rationale}`);
  console.log(
    `  List ${usd(cost.annualPremiumListed)}/yr   less credit ${usd(cost.federalSubsidyApplied)}   net premium ${usd(cost.annualPremiumNet)}/yr`,
  );
  console.log(
    `  Expected out of pocket ${usd(cost.estimatedOutOfPocket)}   Expected total ${usd(cost.estimatedAnnualTotal)}   Worst case ${usd(cost.worstCaseAnnualTotal)}`,
  );
  console.log(
    `  Deductible ${plan.deductibleFamily === null ? "not filed" : usd(plan.deductibleFamily)}   Out of pocket max ${plan.moopFamily === null ? "not filed" : usd(plan.moopFamily)}   Coinsurance ${plan.coinsurance === null ? "not filed" : `${(plan.coinsurance * 100).toFixed(0)}%`}`,
  );
  for (const n of notes) console.log(`  note: ${n}`);
}

const disqualified = evaluations.length - eligible.length;
console.log(`\n${disqualified} plan variants excluded. Reasons:`);
const reasonCounts = new Map<string, number>();
for (const e of evaluations) {
  for (const r of e.disqualifiers) {
    reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }
}
for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${reason}`);
}
