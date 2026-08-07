/**
 * Extracts the New Jersey rows from carrier provider directory files.
 *
 * Carriers publish these under 45 CFR 156.230 in a CMS specified shape, and
 * every record carries the HIOS plan ids it participates in plus the network
 * tier it sits in. That is the join we need: no name matching, no scraping,
 * and a last_updated_on stamp so staleness is visible rather than assumed.
 *
 * The files are sharded nationally rather than by state, so finding the New
 * Jersey rows means reading all of them. Facility files are about 80 MB each
 * and there are 64, so this is a long running job rather than an interactive
 * one. It is resumable: completed shards are recorded and skipped, so it can
 * be stopped and restarted without losing work.
 *
 * Usage: npx tsx scripts/extract-providers.ts [facility|individual]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const KIND = (process.argv[2] ?? "facility") as "facility" | "individual";
const OUT_DIR = "data/providers";
const TMP = join(OUT_DIR, `.tmp-${KIND}.json`);
const OUT = join(OUT_DIR, `nj-${KIND}-2026.jsonl`);
const STATE = join(OUT_DIR, `.state-${KIND}.json`);
const INDEX_URL = "https://api.centene.com/ambetter/reference/cms-data-index.json";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

mkdirSync(OUT_DIR, { recursive: true });

interface SourceAddress {
  address?: string;
  address_2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
}

interface SourcePlan {
  plan_id?: string;
  plan_id_type?: string;
  network_tier?: string;
  years?: number[];
}

interface SourceRecord {
  npi?: string;
  group_name?: string;
  name?: { first?: string; last?: string; middle?: string };
  facility_type?: string[];
  specialty?: string[];
  addresses?: SourceAddress[];
  plans?: SourcePlan[];
  last_updated_on?: string;
}

/** What we keep. Only New Jersey addresses and only New Jersey plans. */
interface NjProvider {
  npi: string;
  name: string;
  kind: "facility" | "individual";
  specialties: string[];
  addresses: Array<{ line: string; city: string; zip: string; phone: string }>;
  plans: Array<{ planId: string; tier: string }>;
  updated: string;
}

const isNjPlan = (id: string) => /^\d{5}NJ\d+/.test(id);

function toNj(r: SourceRecord): NjProvider | null {
  const njPlans = (r.plans ?? [])
    .filter((p) => p.plan_id_type === "HIOS-PLAN-ID" && p.plan_id && isNjPlan(p.plan_id))
    .map((p) => ({ planId: p.plan_id!, tier: p.network_tier ?? "" }));
  if (njPlans.length === 0) return null;

  const njAddresses = (r.addresses ?? [])
    .filter((a) => (a.state ?? "").toUpperCase() === "NJ")
    .map((a) => ({
      line: [a.address, a.address_2].filter(Boolean).join(" ").trim(),
      city: a.city ?? "",
      zip: a.zip ?? "",
      phone: a.phone ?? "",
    }));

  // A provider can participate in a New Jersey plan while sitting just over a
  // state line, which is real for a Philadelphia hospital serving south Jersey.
  // Those are kept, with no New Jersey address, rather than dropped.
  const name =
    r.group_name ??
    [r.name?.first, r.name?.middle, r.name?.last].filter(Boolean).join(" ").trim();
  if (!name) return null;

  return {
    npi: r.npi ?? "",
    name,
    kind: KIND,
    specialties: [...(r.facility_type ?? []), ...(r.specialty ?? [])].filter(Boolean),
    addresses: njAddresses,
    plans: njPlans,
    updated: r.last_updated_on ?? "",
  };
}

interface RunState {
  done: string[];
  kept: number;
  scanned: number;
  startedAt: string;
}

const state: RunState = existsSync(STATE)
  ? JSON.parse(readFileSync(STATE, "utf8"))
  : { done: [], kept: 0, scanned: 0, startedAt: new Date().toISOString() };

const index: { provider_urls: string[] } = await (
  await fetch(INDEX_URL, { headers: { "User-Agent": UA } })
).json();

const urls = index.provider_urls.filter((u) => u.includes(`provider_${KIND}_`));
const remaining = urls.filter((u) => !state.done.includes(u));

console.log(`${KIND} shards: ${urls.length} total, ${state.done.length} already done, ${remaining.length} to go`);
if (state.done.length === 0 && existsSync(OUT)) rmSync(OUT);

let shardNo = state.done.length;
for (const url of remaining) {
  shardNo += 1;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.log(`  [${shardNo}/${urls.length}] HTTP ${res.status}, skipping ${url.split("/").pop()}`);
      continue;
    }
    writeFileSync(TMP, Buffer.from(await res.arrayBuffer()));

    const records: SourceRecord[] = JSON.parse(readFileSync(TMP, "utf8"));
    const kept: NjProvider[] = [];
    for (const r of records) {
      const nj = toNj(r);
      if (nj) kept.push(nj);
    }
    if (kept.length) appendFileSync(OUT, kept.map((k) => JSON.stringify(k)).join("\n") + "\n");

    state.scanned += records.length;
    state.kept += kept.length;
    state.done.push(url);
    writeFileSync(STATE, JSON.stringify(state, null, 1));

    console.log(
      `  [${shardNo}/${urls.length}] ${String(records.length).padStart(6)} scanned, ${String(kept.length).padStart(5)} New Jersey, ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  } catch (err) {
    console.log(`  [${shardNo}/${urls.length}] failed: ${(err as Error).message}`);
  } finally {
    if (existsSync(TMP)) rmSync(TMP);
  }
}

console.log(
  `\nDone. Scanned ${state.scanned.toLocaleString()} records nationally, kept ${state.kept.toLocaleString()} that participate in a New Jersey plan.`,
);
console.log(`Written to ${OUT}`);
