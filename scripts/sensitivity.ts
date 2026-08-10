/**
 * Two questions the sweep cannot answer.
 *
 * One: do the invented prices matter? Every allowed amount in assumptions.ts
 * is an estimate, and they now touch the answer only by positioning a
 * household on the plan's filed cost curve. If rankings survive the prices
 * being wrong by nearly a third in either direction, refining them buys
 * nothing. If they flip, the flips say which prices to go verify.
 *
 * Two: where is the engine's answer fragile? A top pick that beats second
 * place by $40 a year is a coin toss wearing a rank badge. Those are the
 * households where the agent's judgment call is expected to differ from ours,
 * and the honest interface presents them as equivalents rather than a winner.
 *
 * Perturbation is applied to utilization counts rather than to the amounts
 * table, which the module freezes. For total allowed charges the two are the
 * same multiplication; for copay metered visit counts it slightly perturbs
 * the simulation path too, which none of these households reach.
 *
 * Usage: npx tsx scripts/sensitivity.ts
 */

import { loadPlanDataset } from "../src/puf.ts";
import { computeSubsidy } from "../src/subsidy.ts";
import { evaluateAllPlans, buildShortlist } from "../src/rank.ts";
import { fplPercentage } from "../src/assumptions.ts";
import type { Household, Utilization } from "../src/types.ts";

const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);

const UTILIZATION: Record<string, Utilization> = {
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

function incomeAt(fplPct: number, size: number): number {
  let lo = 1000, hi = 1_000_000;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (fplPercentage(mid, size) < fplPct) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** Deterministic RNG so a rerun reproduces the same jitters. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scaleUtil(u: Utilization, factor: (category: string) => number): Utilization {
  const out: Utilization = {};
  for (const [k, v] of Object.entries(u)) out[k as keyof Utilization] = (v ?? 0) * factor(k);
  return out;
}

function shortlistFor(household: Household): string[] {
  const subsidy = computeSubsidy(dataset, household);
  const evals = evaluateAllPlans(dataset, household, new Map(), subsidy);
  return buildShortlist(evals).map((s) => s.evaluation.plan.planId);
}

function household(
  fam: (typeof FAMILIES)[number], fplPct: number, util: Utilization,
): Household {
  return {
    county: "Atlantic",
    annualIncome: incomeAt(fplPct, fam.size),
    householdSize: fam.size,
    members: fam.ages.map((age) => ({ age, tobaccoUser: false, utilization: util })),
    preferredHealthSystems: [],
  };
}

// ---------------------------------------------- part one, price sensitivity

console.log("PRICE SENSITIVITY");
console.log("-".repeat(60));
console.log(
  "\nEvery assumed allowed amount perturbed together (x0.7, x1.3) and\n" +
    "independently per category (20 random draws in [0.7, 1.3]).\n",
);

const rand = mulberry32(20260809);
const JITTERS = 20;

let cases = 0;
let topFlipsGlobal = 0;
let topFlipsJitter = 0;
let jitterTrials = 0;
const flippedWhere: string[] = [];

for (const fam of FAMILIES) {
  for (const utilName of Object.keys(UTILIZATION)) {
    for (const fplPct of [180, 300, 450]) {
      const base = UTILIZATION[utilName]!;
      const baseline = shortlistFor(household(fam, fplPct, base));
      if (!baseline.length) continue;
      cases += 1;
      const where = `${fam.name} / ${utilName} / ${fplPct}%`;

      for (const k of [0.7, 1.3]) {
        const got = shortlistFor(household(fam, fplPct, scaleUtil(base, () => k)));
        if (got[0] !== baseline[0]) {
          topFlipsGlobal += 1;
          flippedWhere.push(`${where}  x${k}`);
        }
      }
      for (let j = 0; j < JITTERS; j += 1) {
        const factors = new Map<string, number>();
        const got = shortlistFor(
          household(fam, fplPct, scaleUtil(base, (c) => {
            if (!factors.has(c)) factors.set(c, 0.7 + rand() * 0.6);
            return factors.get(c)!;
          })),
        );
        jitterTrials += 1;
        if (got[0] !== baseline[0]) topFlipsJitter += 1;
      }
    }
  }
}

console.log(`households tested             ${cases}`);
console.log(`top pick flipped, global x0.7 or x1.3   ${topFlipsGlobal} of ${cases * 2}`);
console.log(`top pick flipped, per category jitter   ${topFlipsJitter} of ${jitterTrials}`);
if (flippedWhere.length) {
  console.log(`\nwhere the global perturbation flipped the top pick:`);
  for (const w of flippedWhere.slice(0, 12)) console.log(`  ${w}`);
}

// ---------------------------------------------- part two, fragility mapping

console.log(`\n\nFRAGILITY OF THE TOP PICK`);
console.log("-".repeat(60));
console.log(
  "\nGap in estimated annual total between first and second place.\n" +
    "Small gaps are coin tosses and should be presented as equivalents.\n",
);

interface Frag { where: string; gap: number; first: string; second: string; }
const frags: Frag[] = [];

for (const fam of FAMILIES) {
  for (const utilName of ["light", "moderate", "heavy"]) {
    for (const fplPct of [150, 250, 350, 450]) {
      const h = household(fam, fplPct, UTILIZATION[utilName]!);
      const subsidy = computeSubsidy(dataset, h);
      const evals = evaluateAllPlans(dataset, h, new Map(), subsidy);
      const short = buildShortlist(evals);
      if (short.length < 2) continue;
      const first = short[0]!.evaluation;
      const second = short[1]!.evaluation;
      frags.push({
        where: `${fam.name} / ${utilName} / ${fplPct}%`,
        gap: second.cost.estimatedAnnualTotal - first.cost.estimatedAnnualTotal,
        first: `${first.plan.issuerName.split(" ")[0]} ${first.plan.marketingName}`.slice(0, 44),
        second: `${second.plan.issuerName.split(" ")[0]} ${second.plan.marketingName}`.slice(0, 44),
      });
    }
  }
}

const bands: Array<[string, (g: number) => boolean]> = [
  ["under $250, a coin toss        ", (g) => g < 250],
  ["$250 to $500, close            ", (g) => g >= 250 && g < 500],
  ["$500 to $1000, real preference ", (g) => g >= 500 && g < 1000],
  ["over $1000, clear answer       ", (g) => g >= 1000],
];
for (const [label, test] of bands) {
  const n = frags.filter((f) => test(f.gap)).length;
  console.log(`${label} ${String(n).padStart(3)} of ${frags.length}`);
}

const closest = [...frags].sort((a, b) => a.gap - b.gap).slice(0, 10);
console.log(`\ntightest races, the first shortlists to put in front of Mike:\n`);
for (const f of closest) {
  console.log(`  $${f.gap.toFixed(0).padStart(5)}  ${f.where}`);
  console.log(`          ${f.first}`);
  console.log(`       vs ${f.second}`);
}
