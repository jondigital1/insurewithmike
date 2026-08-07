/**
 * Downloads the Summary of Benefits and Coverage documents we extract copays
 * from. The PDFs themselves are not committed, at roughly 32 MB, so this is
 * how the extraction is reproduced.
 *
 * Where each carrier's documents live, and how hard they were to find:
 *
 *   Ambetter        Centene serves them from an endpoint addressed by the exact
 *                   HIOS plan id, variant suffix and all. Every plan we hold is
 *                   reachable without scraping anything.
 *   Horizon         A published index page of per plan SBCs. Stable URLs, but
 *                   they carry document ids that will change next plan year.
 *   Oscar           No per plan SBCs. One document covering every plan as a
 *                   benefits grid, which needs a different parser.
 *   AmeriHealth     Not yet located. Their plan names state office visit
 *                   copays, which is where those currently come from.
 *   UnitedHealthcare Not yet located. Their SBCs sit behind a plan picker on
 *                   uhone.com rather than at addressable URLs. This is the gap
 *                   that matters most: the calibration shows UnitedHealthcare
 *                   is where the cost model is furthest wrong.
 *
 * Usage: npx tsx scripts/fetch-sbcs.ts [outdir]
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadPlanDataset } from "../src/puf.ts";

const outDir = process.argv[2] ?? "data/sbc/source";
mkdirSync(join(outDir, "ambetter"), { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function grab(url: string, dest: string): Promise<boolean> {
  if (existsSync(dest)) return true;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return false;
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

// Ambetter, by plan id. Centene exposes every variant this way.
const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);
const ambetter = [...new Set(dataset.plans.filter((p) => p.issuerId === "17970").map((p) => p.planId))];

let ok = 0;
for (const id of ambetter) {
  if (await grab(`https://api.centene.com/SBC/2026/${id}.pdf`, join(outDir, "ambetter", `${id}.pdf`))) ok += 1;
}
console.log(`Ambetter    ${ok} of ${ambetter.length} plan variants`);

// Horizon, from their published 2026 individual plan index at
// horizonblue.com/individual-sbc. Document ids change each plan year.
const HORIZON: Record<string, string> = {
  "horizon-adv-epo-bronze.pdf":
    "https://www.horizonblue.com/securecms-documents/3432/2026%20IHC_Adv_EPO_Bronze_100_50%20$30_50P_Off_Exchange_G3546_P2159_0.pdf",
  "horizon-adv-epo-silver.pdf":
    "https://www.horizonblue.com/securecms-documents/3433/2026%20IHC_Adv_EPO_Silver_100_50_$30_$70%20_Off_Exchange_G3550_P2166_0.pdf",
  "horizon-adv-epo-essentials.pdf":
    "https://www.horizonblue.com/securecms-documents/3434/2026%20IHC_Advantage_EPO_Essentials_100_$0_Off_Exchange_G3576_P2219_0.pdf",
  "horizon-omnia-bronze.pdf":
    "https://www.horizonblue.com/securecms-documents/3435/2026%20IHC_OMNIA%20BRONZE_OFF%20EXCHANGE_G3700_P2287_NOD_0.pdf",
  "horizon-omnia-silver.pdf":
    "https://www.horizonblue.com/securecms-documents/3436/2026%20IHC_OMNIA%20SILVER_OFF%20EXCHANGE_G3707_P2294_NOD_0.pdf",
  "horizon-omnia-silver-saver.pdf":
    "https://www.horizonblue.com/securecms-documents/3437/2026%20IHC_OMNIA%20SILVER%20SAVER%20HSA_OFF%20EXCHANGE_G3720_RX_P2307_NOD_0.pdf",
  "horizon-omnia-silver-value.pdf":
    "https://www.horizonblue.com/securecms-documents/3438/2026%20IHC_OMNIA%20SILVER%20VALUE_OFF%20EXCHANGE_G4074_P2527_NOD_0.pdf",
  "horizon-omnia-gold.pdf":
    "https://www.horizonblue.com/securecms-documents/3439/2026%20IHC_OMNIA%20GOLD_OFF%20EXCHANGE_G4462_P2796_NOD_0.pdf",
};

let hok = 0;
for (const [name, url] of Object.entries(HORIZON)) {
  if (await grab(url, join(outDir, name))) hok += 1;
}
console.log(`Horizon     ${hok} of ${Object.keys(HORIZON).length} plans`);

// Oscar publish one benefits grid rather than per plan SBCs. Kept here because
// it carries a full copay schedule for every Oscar plan including the cost
// sharing variants, but it needs its own parser.
const OSCAR: Record<string, string> = {
  "oscar-nj-2026-onexchange.pdf":
    "https://assets.ctfassets.net/plyq12u1bv8a/5BMrXK0mijj5jgGp48fOLg/e0770e83d984dc08ec3677a57e9a9cdc/New_Jersey___Individual___Family_Plans___2026.pdf",
  "oscar-nj-2026-offexchange.pdf":
    "https://assets.ctfassets.net/plyq12u1bv8a/2tB6LbDsGbIZ3p0jfIn3Ts/70306549975c41eb2ae9b1baf5643b7f/New_Jersey_Off_Exchange___Individual___Family___2026.pdf",
};

let osk = 0;
for (const [name, url] of Object.entries(OSCAR)) {
  if (await grab(url, join(outDir, name))) osk += 1;
}
console.log(`Oscar       ${osk} of ${Object.keys(OSCAR).length} benefit grids`);

console.log("\nStill missing: AmeriHealth SBCs, and UnitedHealthcare entirely.");
