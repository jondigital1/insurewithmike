/**
 * Deep dive across every New Jersey individual medical plan for 2026.
 *
 * Produces the full inventory an agent would need to understand the market:
 * every plan, every cost sharing tier, every network tier, what varies between
 * carriers, what changed since 2025, and precisely where the public data runs
 * out.
 */

import { loadPlanDataset, issuerCounties, rateForAge } from "../src/puf.ts";
import type { Plan, PlanDataset } from "../src/types.ts";

const y2026 = loadPlanDataset("data/nj-sbe-puf-2026", 2026);
const y2025 = loadPlanDataset("data/nj-sbe-puf-2025", 2025);

const usd = (n: number | null) =>
  n === null ? "n/f" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number | null) => (n === null ? "n/f" : `${(n * 100).toFixed(0)}%`);
const rule = (label: string) => {
  console.log("\n" + "=".repeat(100));
  console.log(label);
  console.log("=".repeat(100));
};

const base = (d: PlanDataset) => d.plans.filter((p) => p.planId.endsWith("-01"));

rule("1. MARKET STRUCTURE");

for (const [year, ds] of [[2026, y2026], [2025, y2025]] as const) {
  const b = base(ds);
  console.log(
    `\nPY${year}   base plans ${String(b.length).padStart(3)}   variants ${String(ds.plans.length).padStart(3)}   carriers ${new Set(ds.plans.map((p) => p.issuerId)).size}`,
  );
  const byIssuer = new Map<string, Plan[]>();
  for (const p of b) {
    const list = byIssuer.get(p.issuerName) ?? [];
    list.push(p);
    byIssuer.set(p.issuerName, list);
  }
  for (const [name, plans] of [...byIssuer.entries()].sort((a, b2) => b2[1].length - a[1].length)) {
    const metals = new Map<string, number>();
    for (const p of plans) metals.set(p.metalLevel, (metals.get(p.metalLevel) ?? 0) + 1);
    const counties = issuerCounties(ds, plans[0]!.issuerId).size;
    const networks = new Set(plans.map((p) => p.networkId)).size;
    console.log(
      `  ${name.padEnd(46)} ${String(plans.length).padStart(2)} plans  ${String(counties).padStart(2)} counties  ${networks} network(s)  ${[...metals.entries()].map(([m, c]) => `${m}:${c}`).join(" ")}`,
    );
  }
}

rule("2. EVERY 2026 BASE PLAN, FULL COST SHARING");

console.log(
  `\n${"CARRIER".padEnd(14)} ${"PLAN".padEnd(44)} ${"METAL".padEnd(16)} ${"DED IND".padStart(9)} ${"DED FAM".padStart(9)} ${"COINS".padStart(6)} ${"MOOP IND".padStart(9)} ${"MOOP FAM".padStart(9)} ${"AV".padStart(6)} HSA T2`,
);
for (const p of base(y2026).sort(
  (a, b) => a.issuerName.localeCompare(b.issuerName) || a.metalLevel.localeCompare(b.metalLevel),
)) {
  console.log(
    `${p.issuerName.split(" ")[0]!.padEnd(14)} ${p.marketingName.slice(0, 43).padEnd(44)} ${p.metalLevel.padEnd(16)} ${usd(p.deductibleIndividual).padStart(9)} ${usd(p.deductibleFamily).padStart(9)} ${pct(p.coinsurance).padStart(6)} ${usd(p.moopIndividual).padStart(9)} ${usd(p.moopFamily).padStart(9)} ${pct(p.actuarialValue).padStart(6)} ${p.hsaEligible ? "Y" : "-"}   ${p.hasSecondNetworkTier ? "Y" : "-"}`,
  );
}

rule("3. THE SILVER COST SHARING LADDER");

console.log(
  "\nSame plan, same premium, four different deductibles. Income alone decides which one a household gets.\n",
);
const silverBases = base(y2026).filter((p) => p.metalLevel === "Silver");
console.log(
  `${"PLAN".padEnd(46)} ${"STANDARD".padStart(19)} ${"73% AV".padStart(19)} ${"87% AV".padStart(19)} ${"94% AV".padStart(19)}`,
);
console.log(
  `${"".padEnd(46)} ${"ded / moop".padStart(19)} ${"ded / moop".padStart(19)} ${"ded / moop".padStart(19)} ${"ded / moop".padStart(19)}`,
);
for (const sp of silverBases) {
  const family = y2026.plans.filter((p) => p.standardComponentId === sp.standardComponentId);
  const cell = (variant: string) => {
    const v = family.find((p) => p.csrVariant === variant);
    if (!v) return "-".padStart(19);
    return `${usd(v.deductibleIndividual)} / ${usd(v.moopIndividual)}`.padStart(19);
  };
  console.log(
    `${sp.marketingName.slice(0, 45).padEnd(46)} ${cell("standard")} ${cell("csr73")} ${cell("csr87")} ${cell("csr94")}`,
  );
}

rule("4. NETWORK TIERS");

const tiered = base(y2026).filter((p) => p.hasSecondNetworkTier);
console.log(`\n${tiered.length} of ${base(y2026).length} base plans file a second network tier.\n`);
console.log(
  `${"CARRIER".padEnd(14)} ${"PLAN".padEnd(44)} ${"NET".padEnd(7)} ${"T1 DED".padStart(9)} ${"T2 DED".padStart(9)} ${"T1 MOOP".padStart(9)} ${"T2 MOOP".padStart(9)}`,
);
for (const p of tiered) {
  console.log(
    `${p.issuerName.split(" ")[0]!.padEnd(14)} ${p.marketingName.slice(0, 43).padEnd(44)} ${p.networkId.padEnd(7)} ${usd(p.deductibleIndividual).padStart(9)} ${usd(p.deductibleIndividualTier2).padStart(9)} ${usd(p.moopIndividual).padStart(9)} ${usd(p.moopIndividualTier2).padStart(9)}`,
  );
}

rule("5. PREMIUM CURVE, SINGLE NON SMOKER");

console.log(`\n${"AGE".padStart(4)} ${"CHEAPEST".padStart(10)} ${"MEDIAN".padStart(10)} ${"DEAREST".padStart(10)}   cheapest plan`);
for (const age of [21, 30, 40, 50, 60, 64]) {
  const priced = base(y2026)
    .map((p) => {
      const rates = y2026.rates.get(p.standardComponentId);
      return rates ? { plan: p, rate: rateForAge(rates, age, false) } : null;
    })
    .filter((x): x is { plan: Plan; rate: number } => x !== null && x.rate !== null)
    .sort((a, b) => a.rate - b.rate);
  if (priced.length === 0) continue;
  const median = priced[Math.floor(priced.length / 2)]!;
  console.log(
    `${String(age).padStart(4)} ${usd(priced[0]!.rate).padStart(10)} ${usd(median.rate).padStart(10)} ${usd(priced[priced.length - 1]!.rate).padStart(10)}   ${priced[0]!.plan.issuerName.split(" ")[0]} ${priced[0]!.plan.marketingName.slice(0, 40)}`,
  );
}

const age40 = base(y2026)
  .map((p) => {
    const rates = y2026.rates.get(p.standardComponentId);
    return { plan: p, rate: rates ? rateForAge(rates, 40, false) : null };
  })
  .filter((x): x is { plan: Plan; rate: number } => x.rate !== null);
const smoker40 = base(y2026)
  .map((p) => {
    const rates = y2026.rates.get(p.standardComponentId);
    return { plan: p, rate: rates ? rateForAge(rates, 40, true) : null };
  })
  .filter((x): x is { plan: Plan; rate: number } => x.rate !== null);
const avgNon = age40.reduce((s, x) => s + x.rate, 0) / age40.length;
const avgSmoke = smoker40.reduce((s, x) => s + x.rate, 0) / smoker40.length;
console.log(
  `\nTobacco loading at age 40: non smoker average ${usd(avgNon)}, tobacco average ${usd(avgSmoke)}  (${(((avgSmoke - avgNon) / avgNon) * 100).toFixed(1)}% difference)`,
);

rule("6. YEAR OVER YEAR, 2025 TO 2026");

const prev = new Map(base(y2025).map((p) => [p.standardComponentId, p]));
const curr = new Map(base(y2026).map((p) => [p.standardComponentId, p]));
const survived = [...curr.keys()].filter((k) => prev.has(k));
const discontinued = [...prev.keys()].filter((k) => !curr.has(k));
const introduced = [...curr.keys()].filter((k) => !prev.has(k));

console.log(
  `\nCarried over ${survived.length}   discontinued ${discontinued.length}   newly introduced ${introduced.length}`,
);

console.log("\nDiscontinued plans, clients on these are being moved somewhere:");
for (const id of discontinued) {
  const p = prev.get(id)!;
  console.log(`  ${p.issuerName.split(" ")[0]!.padEnd(14)} ${p.marketingName.slice(0, 55).padEnd(56)} ${p.metalLevel}`);
}

console.log("\nRenewal repricing on plans that survived, age 40 non smoker:");
const changes: Array<{ plan: Plan; before: number; after: number; delta: number }> = [];
for (const id of survived) {
  const before = rateForAge(y2025.rates.get(id) ?? [], 40, false);
  const after = rateForAge(y2026.rates.get(id) ?? [], 40, false);
  if (before === null || after === null) continue;
  changes.push({ plan: curr.get(id)!, before, after, delta: (after - before) / before });
}
changes.sort((a, b) => b.delta - a.delta);
for (const c of changes) {
  const arrow = c.delta >= 0 ? "+" : "";
  console.log(
    `  ${c.plan.issuerName.split(" ")[0]!.padEnd(14)} ${c.plan.marketingName.slice(0, 43).padEnd(44)} ${usd(c.before).padStart(9)} -> ${usd(c.after).padStart(9)}   ${arrow}${(c.delta * 100).toFixed(1)}%`,
  );
}
if (changes.length > 0) {
  const avg = changes.reduce((s, c) => s + c.delta, 0) / changes.length;
  console.log(`\n  Average change across surviving plans: ${(avg * 100).toFixed(1)}%`);
}

rule("7. BENEFIT LEVEL VARIATION");

const benefitStats = new Map<string, { covered: number; total: number; ehb: number; mandate: number }>();
for (const rows of y2026.benefits.values()) {
  for (const r of rows) {
    const s = benefitStats.get(r.benefitName) ?? { covered: 0, total: 0, ehb: 0, mandate: 0 };
    s.total += 1;
    if (r.isCovered) s.covered += 1;
    if (r.isEhb) s.ehb += 1;
    if (r.isStateMandate) s.mandate += 1;
    benefitStats.set(r.benefitName, s);
  }
}
const varying = [...benefitStats.entries()]
  .map(([name, s]) => ({ name, ...s, rate: s.covered / s.total }))
  .filter((b) => b.rate > 0 && b.rate < 1)
  .sort((a, b) => a.rate - b.rate);

console.log(`\n${benefitStats.size} distinct benefits filed. ${varying.length} vary in whether they are covered at all.\n`);
console.log(`${"BENEFIT".padEnd(56)} ${"COVERED".padStart(9)} ${"STATE MANDATE".padStart(14)}`);
for (const b of varying) {
  console.log(
    `${b.name.slice(0, 55).padEnd(56)} ${`${b.covered}/${b.total}`.padStart(9)} ${(b.mandate > 0 ? "yes" : "-").padStart(14)}`,
  );
}

const universal = [...benefitStats.entries()].filter(([, s]) => s.covered === s.total).length;
const never = [...benefitStats.entries()].filter(([, s]) => s.covered === 0);
console.log(`\nCovered by every plan: ${universal}`);
console.log(`Covered by no plan: ${never.length}`);
for (const [name] of never) console.log(`  ${name}`);

rule("8. DATA COMPLETENESS");

const med = y2026.plans;
const check = (label: string, fn: (p: Plan) => boolean) => {
  const n = med.filter(fn).length;
  const flag = n === med.length ? "OK  " : n === 0 ? "GAP " : "PART";
  console.log(`  ${flag} ${label.padEnd(46)} ${String(n).padStart(4)}/${med.length}`);
};
console.log("");
check("deductible, individual", (p) => p.deductibleIndividual !== null);
check("deductible, family", (p) => p.deductibleFamily !== null);
check("coinsurance", (p) => p.coinsurance !== null);
check("out of pocket maximum, individual", (p) => p.moopIndividual !== null);
check("out of pocket maximum, family", (p) => p.moopFamily !== null);
check("actuarial value", (p) => p.actuarialValue !== null);
check("network id", (p) => p.networkId !== "");
check("formulary id", (p) => p.formularyId !== "");
check("rates available", (p) => y2026.rates.has(p.standardComponentId));
check("benefit rows present", (p) => (y2026.benefits.get(p.planId)?.length ?? 0) > 0);

console.log("\n  Per benefit copay amounts: NOT PRESENT in the state based exchange files.");
console.log("  Formulary drug lists:      NOT PRESENT, only an opaque formulary id.");
console.log("  Provider directories:      NOT PRESENT, network url column is empty on all rows.");

rule("9. COPAY AMOUNTS HIDING IN PLAN NAMES");

const named = base(y2026).filter((p) => /\$\d+\s*\/\s*\$\d+/.test(p.marketingName));
console.log(
  `\n${named.length} of ${base(y2026).length} plan names embed a copay pair, which is a partial route to the missing cost sharing data.\n`,
);
for (const p of named) {
  const m = p.marketingName.match(/\$(\d+)\s*\/\s*\$(\d+)/);
  console.log(
    `  ${p.issuerName.split(" ")[0]!.padEnd(14)} ${p.marketingName.slice(0, 58).padEnd(59)} primary $${m?.[1]}  specialist $${m?.[2]}`,
  );
}
