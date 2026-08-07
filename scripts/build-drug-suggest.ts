/**
 * Builds the drug name list the client form's prescription field suggests from.
 *
 * The full formulary index is 3.4 MB, because it carries every plan's tier,
 * prior authorisation and quantity limit for every drug. The client form needs
 * none of that. It needs names to match against, so this emits names only, at
 * roughly a twelfth of the size, and the agent page keeps reading the full
 * index as before.
 *
 * The corpus is RxNorm clinical drug names, which are generic. People know
 * their medication by whatever is printed on the bottle, and for a lot of
 * households that is a brand. A small alias list bridges the common ones, and
 * every alias is checked against the corpus at build time so a pairing that
 * points at a drug we do not hold is dropped rather than shipped.
 *
 * Usage: npx tsx scripts/build-drug-suggest.ts [outdir]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "web";
const source = join(outDir, "formulary.json");
if (!existsSync(source)) {
  console.error(`${source} not found. Run build-agent.ts first.`);
  process.exit(1);
}

const formulary: { planYear: number; drugs: Array<{ name: string }> } = JSON.parse(
  readFileSync(source, "utf8"),
);

/**
 * Brand to generic ingredient, for drugs where the bottle says one thing and
 * the formulary says another.
 *
 * Deliberately short and deliberately conservative. Each entry is a brand whose
 * single active ingredient is not in question. Combination products and brands
 * that have covered different formulations over the years are left out, because
 * the cost of a wrong pairing here is a client confirming a drug they do not
 * take. Anything missing still reaches the agent as free text, which is a worse
 * experience and a correct answer.
 */
const BRAND_ALIASES: Array<[string, string]> = [
  ["Lipitor", "atorvastatin"],
  ["Zocor", "simvastatin"],
  ["Crestor", "rosuvastatin"],
  ["Synthroid", "levothyroxine"],
  ["Levoxyl", "levothyroxine"],
  ["Glucophage", "metformin"],
  ["Zestril", "lisinopril"],
  ["Prinivil", "lisinopril"],
  ["Norvasc", "amlodipine"],
  ["Toprol", "metoprolol"],
  ["Lopressor", "metoprolol"],
  ["Cozaar", "losartan"],
  ["Diovan", "valsartan"],
  ["Lasix", "furosemide"],
  ["Zoloft", "sertraline"],
  ["Prozac", "fluoxetine"],
  ["Lexapro", "escitalopram"],
  ["Celexa", "citalopram"],
  ["Paxil", "paroxetine"],
  ["Wellbutrin", "bupropion"],
  ["Cymbalta", "duloxetine"],
  ["Effexor", "venlafaxine"],
  ["Trazodone", "trazodone"],
  ["Xanax", "alprazolam"],
  ["Ativan", "lorazepam"],
  ["Klonopin", "clonazepam"],
  ["Ambien", "zolpidem"],
  ["Prilosec", "omeprazole"],
  ["Nexium", "esomeprazole"],
  ["Protonix", "pantoprazole"],
  ["Zantac", "ranitidine"],
  ["Pepcid", "famotidine"],
  ["Ventolin", "albuterol"],
  ["ProAir", "albuterol"],
  ["Proventil", "albuterol"],
  ["Singulair", "montelukast"],
  ["Flonase", "fluticasone"],
  ["Zyrtec", "cetirizine"],
  ["Allegra", "fexofenadine"],
  ["Claritin", "loratadine"],
  ["Deltasone", "prednisone"],
  ["Neurontin", "gabapentin"],
  ["Lyrica", "pregabalin"],
  ["Coumadin", "warfarin"],
  ["Plavix", "clopidogrel"],
  ["Eliquis", "apixaban"],
  ["Xarelto", "rivaroxaban"],
  ["Glucotrol", "glipizide"],
  ["Januvia", "sitagliptin"],
  ["Jardiance", "empagliflozin"],
  ["Farxiga", "dapagliflozin"],
  ["Ozempic", "semaglutide"],
  ["Wegovy", "semaglutide"],
  ["Trulicity", "dulaglutide"],
  ["Synthroid", "levothyroxine"],
  ["Flomax", "tamsulosin"],
  ["Viagra", "sildenafil"],
  ["Cialis", "tadalafil"],
  ["Fosamax", "alendronate"],
  ["Mobic", "meloxicam"],
  ["Celebrex", "celecoxib"],
  ["Ultram", "tramadol"],
  ["Zofran", "ondansetron"],
  ["Imitrex", "sumatriptan"],
  ["Valtrex", "valacyclovir"],
  ["Diflucan", "fluconazole"],
  ["Keflex", "cephalexin"],
  ["Zithromax", "azithromycin"],
  ["Bactrim", "sulfamethoxazole"],
  ["Amoxil", "amoxicillin"],
  ["Adderall", "amphetamine"],
  ["Ritalin", "methylphenidate"],
  ["Concerta", "methylphenidate"],
  ["Strattera", "atomoxetine"],
  ["Abilify", "aripiprazole"],
  ["Seroquel", "quetiapine"],
  ["Lamictal", "lamotrigine"],
  ["Depakote", "divalproex"],
  ["Topamax", "topiramate"],
  ["Keppra", "levetiracetam"],
  ["Aricept", "donepezil"],
  ["Restasis", "cyclosporine"],
  ["Premarin", "estrogens"],
  ["Provera", "medroxyprogesterone"],
];

// Names, deduped and sorted. Sorting matters: the suggester ranks by how the
// query matches, and a stable order keeps equal matches in a sensible sequence
// rather than in whatever order the filing happened to list them.
const names = [...new Set(formulary.drugs.map((d) => d.name.trim()).filter(Boolean))].sort(
  (a, b) => a.localeCompare(b, "en"),
);

const lower = names.map((n) => n.toLowerCase());

// Every alias has to point at something we actually hold. A brand suggesting a
// drug that is not in the corpus would offer the client a dead end.
const seen = new Set<string>();
const aliases: Array<[string, string]> = [];
const dropped: string[] = [];
for (const [brand, generic] of BRAND_ALIASES) {
  const key = brand.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  if (lower.some((n) => n.includes(generic.toLowerCase()))) aliases.push([brand, generic]);
  else dropped.push(`${brand} to ${generic}`);
}

const payload = { planYear: formulary.planYear, names, aliases };
const json = JSON.stringify(payload);
writeFileSync(join(outDir, "drugs.json"), json, "utf8");

console.log(`drugs.json      ${(json.length / 1024).toFixed(0)} KB   ${names.length} names, ${aliases.length} brand aliases`);
if (dropped.length) {
  console.log(`  ${dropped.length} aliases dropped, generic not in the corpus:`);
  for (const d of dropped) console.log(`    ${d}`);
}
