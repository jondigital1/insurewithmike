/**
 * Extracts the OMNIA tier 1 and tier 2 provider rosters from Horizon's
 * Transparency in Coverage files.
 *
 * Why this exists. New Jersey runs its own exchange, so the federal machine
 * readable route is closed to us: the PY2026 machine readable URL PUF carries
 * 30 states and New Jersey is not one of them, and neither is any New Jersey
 * issuer. What is NOT closed is Transparency in Coverage, which binds every
 * issuer regardless of which exchange they sell on. Horizon publishes there,
 * and publishes OMNIA tier 1 and tier 2 as two separate in-network files.
 *
 * The tier split is the thing the intake has never been able to answer and the
 * thing OMNIA clients actually get wrong: a tier 2 hospital on an OMNIA plan
 * costs the client materially more, and today we say "network unverified".
 *
 * The whole file is 750 MB gzipped for tier 1, which is tens of gigabytes
 * inflated. We do not need any of that. The `provider_references` array sits
 * at the head of the file, before the negotiated rates, and it carries the
 * roster: NPIs, tax id and business name per provider group, each tagged with
 * the network name. So we stream, inflate, take the roster, and hang up as
 * soon as that array closes. In practice that is a small fraction of the file.
 *
 * Usage: npx tsx scripts/extract-omnia-tiers.ts
 */

import { createGunzip } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const INDEX =
  "https://horizonblue.sapphiremrfhub.com/tocs/202608/2026-08-01_horizon-healthcare-services_index.json";

const OUT_DIR = "data/providers";
const OUT = `${OUT_DIR}/horizon-omnia-tiers.json`;

interface ProviderGroup {
  npi?: number[];
  tin?: { type?: string; value?: string; business_name?: string };
}
interface ProviderReference {
  provider_group_id?: number;
  network_name?: string[];
  provider_groups?: ProviderGroup[];
}

export interface RosterEntry {
  groupId: number | null;
  tin: string | null;
  name: string | null;
  npis: number[];
}

/**
 * Pulls complete `{...}` objects out of the provider_references array as the
 * text arrives. Tracks string state so a brace inside a business name cannot
 * throw the depth count off. Returns once the array's closing bracket is seen.
 */
class ReferenceScanner {
  private buf = "";
  /** How far into `buf` we have already scanned, so no character is read twice. */
  private pos = 0;
  private depth = 0;
  private start = -1;
  private inString = false;
  private escaped = false;
  private started = false;
  done = false;
  readonly out: ProviderReference[] = [];

  push(text: string): void {
    if (this.done) return;
    this.buf += text;

    if (!this.started) {
      const at = this.buf.indexOf('"provider_references"');
      if (at < 0) {
        // Keep a tail in case the key straddles a chunk boundary.
        if (this.buf.length > 1_000) this.buf = this.buf.slice(-1_000);
        return;
      }
      const open = this.buf.indexOf("[", at);
      if (open < 0) return;
      this.buf = this.buf.slice(open + 1);
      this.pos = 0;
      this.started = true;
    }

    // Single forward pass. The scan resumes where it left off and the buffer is
    // only compacted between entries, never inside one. The first cut of this
    // sliced the buffer and restarted from zero on every completed object,
    // which is quadratic; on the tier 1 file, whose entries run to about 1.4 MB
    // because a hospital system carries thousands of NPIs, that turned a job
    // the network can do in a minute into one that never finished.
    for (let i = this.pos; i < this.buf.length; i++) {
      const ch = this.buf.charCodeAt(i);
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === 92 /* \ */) this.escaped = true;
        else if (ch === 34 /* " */) this.inString = false;
        continue;
      }
      if (ch === 34 /* " */) {
        this.inString = true;
      } else if (ch === 123 /* { */) {
        if (this.depth === 0) this.start = i;
        this.depth++;
      } else if (ch === 125 /* } */) {
        this.depth--;
        if (this.depth === 0 && this.start >= 0) {
          try {
            this.out.push(JSON.parse(this.buf.slice(this.start, i + 1)) as ProviderReference);
          } catch {
            /* a truncated or odd entry is not worth failing the run over */
          }
          this.start = -1;
        }
      } else if (ch === 93 /* ] */ && this.depth === 0) {
        this.done = true;
        return;
      }
      this.pos = i + 1;
    }

    // Drop what has been consumed, but only when no entry is open across it.
    if (this.depth === 0 && this.start < 0 && this.pos > 0) {
      this.buf = this.buf.slice(this.pos);
      this.pos = 0;
    } else if (this.start > 0) {
      this.buf = this.buf.slice(this.start);
      this.pos -= this.start;
      this.start = 0;
    }
  }
}

/**
 * These files are served over a connection that drops fairly readily, and a
 * drop 300 MB into a single streamed response costs the whole read. So pull
 * the gzip in byte ranges and feed the pieces to one inflater: consecutive
 * ranges concatenate back into the original stream, which means a failure
 * costs one chunk rather than the run. We stop as soon as the roster closes.
 */
const CHUNK = 16 * 1048576;
const RETRIES = 4;

async function roster(url: string, label: string): Promise<ProviderReference[]> {
  const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
  const size = Number(head.headers.get("content-length") ?? 0);
  process.stdout.write(`${label}: ${(size / 1048576).toFixed(0)} MB gzipped\n`);

  const scanner = new ReferenceScanner();
  const gunzip = createGunzip();
  let inflated = 0;
  let failed: unknown = null;

  gunzip.on("data", (c: Buffer) => {
    inflated += c.length;
    if (!scanner.done) scanner.push(c.toString("utf8"));
  });
  gunzip.on("error", (e) => { failed = e; });

  let offset = 0;
  while (offset < size && !scanner.done && !failed) {
    const end = Math.min(offset + CHUNK, size) - 1;
    let buf: Buffer | null = null;
    for (let attempt = 1; attempt <= RETRIES && !buf; attempt++) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA, Range: `bytes=${offset}-${end}` } });
        if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
        buf = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        if (attempt === RETRIES) throw new Error(`${label}: range ${offset}-${end} failed: ${String(e)}`);
        await new Promise((res) => setTimeout(res, 400 * attempt));
      }
    }
    await new Promise<void>((res, rej) => gunzip.write(buf!, (e) => (e ? rej(e) : res())));
    offset = end + 1;
    process.stdout.write(
      `  ${label}: ${(offset / 1048576).toFixed(0)}/${(size / 1048576).toFixed(0)} MB read, ` +
        `${(inflated / 1048576).toFixed(0)} MB inflated, ${scanner.out.length} groups\n`
    );
  }
  gunzip.destroy();
  if (failed && !scanner.out.length) throw failed;
  process.stdout.write(
    `${label}: ${scanner.done ? "roster complete" : "roster truncated"}, ${scanner.out.length} groups ` +
      `after reading ${(offset / 1048576).toFixed(0)} of ${(size / 1048576).toFixed(0)} MB\n`
  );
  return scanner.out;
}

function flatten(refs: ProviderReference[]): { entries: RosterEntry[]; networks: string[] } {
  const entries: RosterEntry[] = [];
  const networks = new Set<string>();
  for (const r of refs) {
    (r.network_name ?? []).forEach((n) => networks.add(n));
    for (const g of r.provider_groups ?? []) {
      entries.push({
        groupId: r.provider_group_id ?? null,
        tin: g.tin?.value ?? null,
        name: g.tin?.business_name ?? null,
        npis: g.npi ?? [],
      });
    }
  }
  return { entries, networks: [...networks] };
}

const idx = await (await fetch(INDEX, { headers: { "User-Agent": UA } })).json();
const locations = new Set<string>();
for (const s of idx.reporting_structure ?? [])
  for (const f of s.in_network_files ?? []) locations.add(f.location as string);

const pick = (token: string): string => {
  const hit = [...locations].find((u) => u.includes(token) && !u.includes("Bundled"));
  if (!hit) throw new Error(`no in-network file matching ${token}`);
  return hit;
};

const targets: Array<[string, string]> = [
  ["tier1", pick("_OMT1_in-network-rates")],
  ["tier2", pick("_OMT2_in-network-rates")],
];

mkdirSync(OUT_DIR, { recursive: true });
const result: Record<string, { network: string[]; source: string; groups: number; entries: RosterEntry[] }> = {};

for (const [tier, url] of targets) {
  const refs = await roster(url, tier);
  const { entries, networks } = flatten(refs);
  result[tier] = { network: networks, source: url, groups: refs.length, entries };
}

writeFileSync(
  OUT,
  JSON.stringify(
    { planYear: 2026, retrievedFrom: INDEX, lastUpdatedOn: idx.last_updated_on ?? null, ...result },
    null,
    1
  )
);

for (const [tier, v] of Object.entries(result)) {
  const named = v.entries.filter((e) => e.name).length;
  console.log(
    `${tier}: ${v.entries.length} provider groups, ${named} with a business name, networks ${v.network.join(", ")}`
  );
}
console.log(`wrote ${OUT}`);
