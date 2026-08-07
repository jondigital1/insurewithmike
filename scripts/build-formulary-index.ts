/**
 * Builds a compact New Jersey formulary index from carrier machine readable
 * files.
 *
 * Carriers publish these under the qualified health plan rules at 45 CFR
 * 156.122, in a CMS specified JSON shape, and they join on the HIOS plan id we
 * already hold. That is the whole reason this is tractable: no name matching
 * between systems, no scraping, an exact key.
 *
 * Ambetter, through Centene, publishes a per state file. The others have not
 * been located yet, so this covers one carrier of five and says so.
 *
 * The published file is 5.4 MB because it repeats the full plan list against
 * every drug. This rewrites it as one record per drug with a compact per plan
 * map, which is what the browser bundle can afford to carry.
 *
 * Usage: npx tsx scripts/build-formulary-index.ts <input.json> [out.json]
 */

import { readFileSync, writeFileSync } from "node:fs";

interface SourcePlan {
  plan_id: string;
  plan_id_type: string;
  drug_tier: string;
  prior_authorization: boolean;
  step_therapy: boolean;
  quantity_limit: boolean;
  years?: number[];
}

interface SourceDrug {
  rxnorm_id: string;
  drug_name: string;
  plans: SourcePlan[];
}

/** Flags that change whether a client can actually get the drug easily. */
export interface DrugOnPlan {
  /** GENERIC, PREFERRED-BRAND, NON-PREFERRED-BRAND, SPECIALTY and so on. */
  tier: string;
  /** Needs the carrier's approval before it will be paid for. */
  priorAuth: boolean;
  /** Must fail a cheaper drug first. */
  stepTherapy: boolean;
  quantityLimit: boolean;
}

export interface FormularyEntry {
  rxnorm: string;
  name: string;
  /** Lower cased name, for matching what a client types. */
  search: string;
  plans: Record<string, DrugOnPlan>;
}

const input = process.argv[2];
if (!input) {
  console.error("usage: npx tsx scripts/build-formulary-index.ts <input.json> [out.json]");
  process.exit(1);
}

const raw: SourceDrug[] = JSON.parse(readFileSync(input, "utf8"));

const entries: FormularyEntry[] = [];
const planIds = new Set<string>();
const tiers = new Map<string, number>();
let withPriorAuth = 0;
let withStep = 0;

for (const drug of raw) {
  const plans: Record<string, DrugOnPlan> = {};
  for (const p of drug.plans) {
    if (p.plan_id_type !== "HIOS-PLAN-ID") continue;
    planIds.add(p.plan_id);
    plans[p.plan_id] = {
      tier: p.drug_tier,
      priorAuth: Boolean(p.prior_authorization),
      stepTherapy: Boolean(p.step_therapy),
      quantityLimit: Boolean(p.quantity_limit),
    };
    tiers.set(p.drug_tier, (tiers.get(p.drug_tier) ?? 0) + 1);
    if (p.prior_authorization) withPriorAuth += 1;
    if (p.step_therapy) withStep += 1;
  }
  if (Object.keys(plans).length === 0) continue;
  entries.push({
    rxnorm: drug.rxnorm_id,
    name: drug.drug_name,
    search: drug.drug_name.toLowerCase(),
    plans,
  });
}

const out = process.argv[3] ?? "data/formulary/nj-2026.json";
const payload = JSON.stringify({ planYear: 2026, drugs: entries });
writeFileSync(out, payload, "utf8");

const rawSize = readFileSync(input).length;
console.log(`\nFormulary index written to ${out}`);
console.log(`  drugs                ${entries.length}`);
console.log(`  plans referenced     ${planIds.size}  (${[...planIds].sort().join(", ")})`);
console.log(
  `  size                 ${(rawSize / 1024 / 1024).toFixed(2)} MB in, ${(payload.length / 1024).toFixed(0)} KB out`,
);
console.log(`\n  drug tiers in use:`);
for (const [t, n] of [...tiers.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${t.padEnd(24)} ${n}`);
}
console.log(
  `\n  ${withPriorAuth} plan-drug pairs need prior authorisation, ${withStep} need step therapy.`,
);
console.log(
  `  Those two are what turn "it is covered" into a phone call, so they are worth\n  surfacing to the agent rather than only the tier.`,
);
