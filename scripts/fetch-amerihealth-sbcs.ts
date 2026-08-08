/**
 * Downloads AmeriHealth New Jersey's Summary of Benefits and Coverage
 * documents, addressed properly rather than guessed.
 *
 * This supersedes the AmeriHealth half of `scripts/fetch-sbcs.ts`, whose note
 * reads that their SBCs are "addressed by an internal form code rather than by
 * anything in the filings, so there is no way to derive the URL from a plan
 * id", and whose form codes were found by probing. There is a way, it is just
 * not where the other carriers put it.
 *
 * AmeriHealth publishes a CMS-format machine-readable index for New Jersey off
 * their developer resources page rather than at the well-known
 * /cms-data-index.json path, which is why probing that path 404s. The index for
 * issuer 91762 points at a plans.json in which every plan carries `plan_id` as
 * a HIOS standard component id and `summary_url` as its exact SBC. That covers
 * all 11 of our standard component ids, so all 51 plan variants, against the 6
 * the probing found.
 *
 * Closing this also retires `copaysFromName` in src/puf.ts as a source, which
 * is currently the provenance behind 48 copay entries read out of marketing
 * names rather than a benefits document.
 *
 * Usage: npx tsx scripts/fetch-amerihealth-sbcs.ts [outdir] [planYear]
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadPlanDataset } from "../src/puf.ts";

const OUT = process.argv[2] ?? "data/sbc/source/amerihealth";
const YEAR = process.argv[3] ?? "2026";
const INDEX = "https://www.amerihealthnj.com/Resources/cms-data/ahnj-ic/index.json";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface PlanEntry {
  plan_id?: string;
  plan_id_type?: string;
  marketing_name?: string;
  summary_url?: string;
  years?: number[];
}

mkdirSync(OUT, { recursive: true });

const index = (await (await fetch(INDEX, { headers: { "User-Agent": UA } })).json()) as {
  plan_urls?: string[];
};
const planUrl = index.plan_urls?.[0];
if (!planUrl) throw new Error("no plan_urls in the AmeriHealth NJ index");

const raw = (await (await fetch(planUrl, { headers: { "User-Agent": UA } })).json()) as
  | PlanEntry[]
  | { plans?: PlanEntry[] };
const entries = Array.isArray(raw) ? raw : (raw.plans ?? []);

/**
 * One HIOS id appears once per plan year, so pick the year we model. Falling
 * back to the url path keeps this working if `years` is ever dropped.
 */
const forYear = entries.filter(
  (e) => e.years?.includes(Number(YEAR)) ?? e.summary_url?.includes(`/${YEAR}/`)
);

// Only fetch documents for plans we actually hold.
const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);
const wanted = new Set(
  dataset.plans.filter((p) => p.issuerId === "91762").map((p) => p.standardComponentId)
);

const seen = new Set<string>();
let ok = 0;
let skipped = 0;
const missing: string[] = [];

for (const e of forYear) {
  const id = e.plan_id;
  const url = e.summary_url;
  if (!id || !url || !wanted.has(id) || seen.has(id)) continue;
  seen.add(id);

  const dest = join(OUT, `${id}.pdf`);
  if (existsSync(dest)) { skipped += 1; ok += 1; continue; }
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) { missing.push(`${id} HTTP ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    // A login wall or an error page is not a PDF, and is worse than nothing
    // because the extractor would treat it as a document it failed to read.
    if (buf.subarray(0, 4).toString("latin1") !== "%PDF") {
      missing.push(`${id} not a pdf (${buf.length} bytes)`);
      continue;
    }
    writeFileSync(dest, buf);
    ok += 1;
    console.log(`  ${id}  ${(buf.length / 1024).toFixed(0)} KB  ${e.marketing_name ?? ""}`);
  } catch (err) {
    missing.push(`${id} ${String(err).slice(0, 60)}`);
  }
}

console.log(
  `\nAmeriHealth ${YEAR}: ${ok} of ${wanted.size} standard component ids` +
    (skipped ? ` (${skipped} already on disk)` : "")
);
if (missing.length) {
  console.log("not retrieved:");
  missing.forEach((m) => console.log(`  ${m}`));
}
