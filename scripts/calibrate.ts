/**
 * Tests the cost model against the filed coverage examples.
 *
 * Every plan files what the member actually pays for three standardised
 * scenarios. That is the only filed cost sharing outcome available and the
 * only honest way to check whether the model's numbers mean anything.
 *
 * WHAT THIS DOES NOT DO, AND WHY.
 *
 * A first attempt tried to recover each scenario's total allowed cost from the
 * filings and then score the model in dollars. That does not work, and the
 * reason is interesting. UnitedHealthcare files $1,100 as the member's cost for
 * Joe's diabetes while AmeriHealth files $5,420, and both are bronze plans with
 * a $6,000 deductible. Neither is wrong. They expose different fractions of
 * chronic care to the deductible, because HSA plans may cover chronic care
 * before the deductible under an IRS safe harbour. There is no single "amount
 * of the scenario subject to cost sharing" to recover.
 *
 * So this scores the thing that actually decides a shortlist: does the model
 * put plans in the same ORDER the filings do? Absolute dollars can be off by a
 * constant and the recommendation is still right. Order cannot.
 *
 * Usage: npx tsx scripts/calibrate.ts
 */

import { loadPlanDataset } from "../src/puf.ts";
import { applyCostSharing } from "../src/cost.ts";
import type { CoverageScenario, Plan } from "../src/types.ts";

const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);
const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const rule = (s: string) => console.log("\n" + "=".repeat(92) + "\n" + s + "\n" + "=".repeat(92));

const SCENARIOS: CoverageScenario[] = ["managingDiabetes", "simpleFracture", "havingABaby"];
const LABEL: Record<CoverageScenario, string> = {
  managingDiabetes: "Managing Joe's type 2 diabetes",
  simpleFracture: "Mia's simple fracture",
  havingABaby: "Peg is having a baby",
};

/**
 * Published CMS totals for the standardised scenarios. Used only as an
 * operating point at which to compare orderings, never as ground truth for
 * dollars. Shifting them changes the absolute predictions but barely touches
 * the ordering, which is what is being measured.
 */
const OPERATING_POINT: Record<CoverageScenario, number> = {
  managingDiabetes: 5600,
  simpleFracture: 2800,
  havingABaby: 12700,
};

/**
 * Tribal cost sharing variants are excluded. Those plans are meant to charge
 * the member nothing, so scoring a cost model against them measures nothing.
 * Scoring against them was the flaw in the first version of this script.
 */
const plans = dataset.plans.filter(
  (p) => p.csrVariant !== "zeroCostSharing" && p.csrVariant !== "limitedCostSharing",
);

console.log(
  `\n${dataset.plans.length} variants filed, ${dataset.plans.length - plans.length} excluded as tribal zero or limited cost sharing, ${plans.length} scored.`,
);

/**
 * Office visits in each standardised scenario, from the CMS service lists.
 *
 * Joe's diabetes is a year of primary care visits including disease education.
 * Peg's prenatal care is filed as specialist visits. Mia's fracture is an
 * emergency room visit, an x-ray, crutches and physical therapy, with no
 * office visits at all.
 *
 * That last one is the test. Copays should move the first two scenarios and
 * leave the third untouched. If the fracture number moves, the model is wrong.
 */
const SCENARIO_VISITS: Record<CoverageScenario, { primaryCareVisits?: number; specialistVisits?: number }> = {
  managingDiabetes: { primaryCareVisits: 8 },
  havingABaby: { specialistVisits: 12 },
  simpleFracture: {},
};

rule("0. COPAYS RECOVERED FROM PLAN NAMES");

const withCopays = plans.filter((p) => p.copayPrimaryCare !== null);
const usable = withCopays.filter((p) => !p.hsaEligible);
console.log(
  `\n  ${withCopays.length} of ${plans.length} variants state a copay pair in their name.`,
);
console.log(
  `  ${usable.length} of those are usable. The rest are health savings account plans, which are barred`,
);
console.log(`  from charging a copay before the deductible, so the figure does not apply.\n`);

const byIssuer = new Map<string, number>();
for (const p of withCopays) {
  const name = p.issuerName.split(" ")[0] ?? p.issuerId;
  byIssuer.set(name, (byIssuer.get(name) ?? 0) + 1);
}
for (const [issuer, n] of [...byIssuer.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${issuer.padEnd(16)} ${String(n).padStart(3)} variants`);
}

const distinct = [
  ...new Set(usable.map((p) => `${p.copayPrimaryCare}/${p.copaySpecialist}`)),
].sort();
console.log(`\n  Copay pairs in use: ${distinct.map((d) => "$" + d.replace("/", " / $")).join(", ")}`);

// -------------------------------------------------------- rank correlation

/** Spearman rank correlation. 1.0 means identical ordering. */
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const r = new Array<number>(xs.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]!.v === idx[i]!.v) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) r[idx[k]!.i] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

rule("1. DOES THE MODEL ORDER PLANS THE WAY THE FILINGS DO?");

/** Scores one scenario, optionally letting the model see office visit copays. */
function scoreScenario(scenario: CoverageScenario, useCopays: boolean) {
  const rows = plans
    .map((p) => ({
      plan: p,
      filed: p.coverageExamples[scenario]?.total,
      model: applyCostSharing(
        p,
        OPERATING_POINT[scenario],
        false,
        useCopays ? SCENARIO_VISITS[scenario] : undefined,
      ).outOfPocket,
    }))
    .filter((r): r is { plan: Plan; filed: number; model: number } => r.filed !== undefined);

  const rho = spearman(
    rows.map((r) => r.model),
    rows.map((r) => r.filed),
  );
  const bestFiled = new Set(
    [...rows].sort((a, b) => a.filed - b.filed).slice(0, 5).map((r) => r.plan.planId),
  );
  const overlap = [...rows]
    .sort((a, b) => a.model - b.model)
    .slice(0, 5)
    .filter((r) => bestFiled.has(r.plan.planId)).length;

  return { rows, rho, overlap };
}

console.log(
  `\n${"SCENARIO".padEnd(32)} ${"BLIND".padStart(8)} ${"WITH COPAYS".padStart(12)} ${"CHANGE".padStart(8)} ${"TOP 5".padStart(12)}`,
);

const perScenario: Array<{ scenario: CoverageScenario; rho: number }> = [];

for (const scenario of SCENARIOS) {
  const before = scoreScenario(scenario, false);
  const after = scoreScenario(scenario, true);
  perScenario.push({ scenario, rho: after.rho });
  const delta = after.rho - before.rho;
  console.log(
    `${LABEL[scenario].padEnd(32)} ${before.rho.toFixed(3).padStart(8)} ${after.rho.toFixed(3).padStart(12)} ${`${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`.padStart(8)} ${`${before.overlap} -> ${after.overlap}`.padStart(12)}`,
  );
}

console.log(
  `\n"Blind" is the model with no copay data. "With copays" lets it use the office visit\nfigures recovered from plan names. Mia's fracture has no office visits in it, so it is\nthe control: if that row moves, the change is doing something other than what it claims.`,
);

console.log(
  `\nSpearman compares orderings only. 1.0 means the model ranks every plan exactly as the\nfilings do. "Top 5 hit" asks how many of the five genuinely cheapest plans for that\nscenario the model also puts in its own cheapest five, which is closer to what a\nshortlist actually needs.`,
);

// --------------------------------------------------- where it goes wrong

rule("2. WHERE THE ORDERING BREAKS");

for (const scenario of SCENARIOS) {
  const rows = plans
    .map((p) => ({
      plan: p,
      filed: p.coverageExamples[scenario]?.total,
      model: applyCostSharing(p, OPERATING_POINT[scenario], false, SCENARIO_VISITS[scenario])
        .outOfPocket,
    }))
    .filter((r): r is { plan: Plan; filed: number; model: number } => r.filed !== undefined);

  const byFiled = [...rows].sort((a, b) => a.filed - b.filed);
  const byModel = [...rows].sort((a, b) => a.model - b.model);
  const filedRank = new Map(byFiled.map((r, i) => [r.plan.planId, i + 1]));
  const modelRank = new Map(byModel.map((r, i) => [r.plan.planId, i + 1]));

  const worst = rows
    .map((r) => ({
      r,
      gap: (modelRank.get(r.plan.planId) ?? 0) - (filedRank.get(r.plan.planId) ?? 0),
    }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 3);

  console.log(`\n${LABEL[scenario]}`);
  for (const w of worst) {
    const dir = w.gap > 0 ? "model ranks it worse than it is" : "model ranks it better than it is";
    console.log(
      `  ${w.r.plan.issuerName.split(" ")[0]!.padEnd(12)} ${w.r.plan.marketingName.slice(0, 34).padEnd(35)} ${w.r.plan.metalLevel.padEnd(16)} filed rank ${String(filedRank.get(w.r.plan.planId)).padStart(3)}, model rank ${String(modelRank.get(w.r.plan.planId)).padStart(3)}   ${dir}`,
    );
  }
}

// --------------------------------------------------- metal level bias

rule("3. SYSTEMATIC BIAS BY METAL LEVEL");

console.log(
  `\nAverage rank the model gives a plan, minus the rank the filings give it. Negative means\nthe model flatters that metal level and will over-recommend it.\n`,
);
console.log(`${"METAL".padEnd(18)} ${SCENARIOS.map((s) => LABEL[s].slice(0, 12).padStart(14)).join("")}`);

const metals = [...new Set(plans.map((p) => p.metalLevel))].sort();
for (const metal of metals) {
  const cells: string[] = [];
  for (const scenario of SCENARIOS) {
    const rows = plans
      .map((p) => ({
        plan: p,
        filed: p.coverageExamples[scenario]?.total,
        model: applyCostSharing(p, OPERATING_POINT[scenario], false).outOfPocket,
      }))
      .filter((r): r is { plan: Plan; filed: number; model: number } => r.filed !== undefined);
    const byFiled = [...rows].sort((a, b) => a.filed - b.filed);
    const byModel = [...rows].sort((a, b) => a.model - b.model);
    const filedRank = new Map(byFiled.map((r, i) => [r.plan.planId, i + 1]));
    const modelRank = new Map(byModel.map((r, i) => [r.plan.planId, i + 1]));
    const subset = rows.filter((r) => r.plan.metalLevel === metal);
    if (!subset.length) {
      cells.push("".padStart(14));
      continue;
    }
    const avg =
      subset.reduce(
        (s, r) => s + ((modelRank.get(r.plan.planId) ?? 0) - (filedRank.get(r.plan.planId) ?? 0)),
        0,
      ) / subset.length;
    cells.push(`${avg >= 0 ? "+" : ""}${avg.toFixed(1)}`.padStart(14));
  }
  console.log(`${metal.padEnd(18)} ${cells.join("")}`);
}

// --------------------------------------------------- the recommendation

rule("4. WHAT TO DO ABOUT IT");

const avgRho = perScenario.reduce((s, p) => s + p.rho, 0) / perScenario.length;
console.log(`\n  Average rank correlation across the three scenarios: ${avgRho.toFixed(3)}`);
console.log(
  `\n  The filed examples are better used directly than as a correction to the simulation.\n  When a client's year looks like one of these three, the filing already states what they\n  would pay on every plan, with copays, limits and exclusions included. No modelling\n  needed and no assumptions to defend.\n\n  The simulation is still required for everything in between, but it should be scored on\n  ordering rather than dollars, because the dollars depend on an allowed cost that plans\n  demonstrably do not treat consistently.`,
);
