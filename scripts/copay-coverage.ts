/**
 * Reports how much of the market we can now see copays for, by carrier.
 *
 * Counts only the variants that can actually be recommended. Tribal zero and
 * limited cost sharing variants are excluded because the member pays nothing
 * on them, so a missing copay there costs us nothing.
 *
 * Usage: npx tsx scripts/copay-coverage.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { loadPlanDataset } from "../src/puf.ts";

const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);

const sbc: Array<{ planId: string | null; planName: string | null; primaryCare: number | null }> =
  existsSync("data/sbc/copays-2026.json")
    ? JSON.parse(readFileSync("data/sbc/copays-2026.json", "utf8"))
    : [];
const oscar: Array<{ planName: string; csrVariant: string; benefits: Record<string, string> }> =
  existsSync("data/sbc/oscar-copays-2026.json")
    ? JSON.parse(readFileSync("data/sbc/oscar-copays-2026.json", "utf8"))
    : [];

const byPlanId = new Set(
  sbc.filter((s) => s.planId && s.primaryCare !== null).map((s) => s.planId as string),
);
const horizonNames = sbc
  .filter((s) => !s.planId && s.primaryCare !== null && s.planName)
  .map((s) => (s.planName as string).toLowerCase());
const oscarKeys = new Set(
  oscar
    .filter((o) => o.benefits.primaryCare)
    .map((o) => `${o.planName.toLowerCase()}|${o.csrVariant}`),
);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function covered(planId: string, issuerId: string, name: string, variant: string): boolean {
  if (byPlanId.has(planId)) return true;
  if (issuerId === "23818") {
    const n = norm(name);
    for (const key of oscarKeys) {
      const [oname, ovariant] = key.split("|");
      if (ovariant === variant && norm(oname!) === n) return true;
    }
    return false;
  }
  if (issuerId === "91661") {
    const n = norm(name);
    return horizonNames.some((h) => norm(h) === n || n.includes(norm(h)) || norm(h).includes(n));
  }
  // AmeriHealth state office visit copays in the plan name itself.
  if (issuerId === "91762") return /\$\d+\s*\/\s*\$\d+/.test(name);
  return false;
}

const rankable = dataset.plans.filter(
  (p) => p.csrVariant !== "zeroCostSharing" && p.csrVariant !== "limitedCostSharing",
);

const rows = new Map<string, { total: number; have: number; source: string }>();
const SOURCE: Record<string, string> = {
  "17970": "Centene endpoint, by plan id",
  "23818": "published benefits grid",
  "37777": "nothing located",
  "91661": "published SBC index",
  "91762": "plan names only, no SBCs found",
};

for (const p of rankable) {
  const key = p.issuerName;
  const row = rows.get(key) ?? { total: 0, have: 0, source: SOURCE[p.issuerId] ?? "" };
  row.total += 1;
  if (covered(p.planId, p.issuerId, p.marketingName, p.csrVariant)) row.have += 1;
  rows.set(key, row);
}

console.log(`\nCopay coverage across the ${rankable.length} recommendable plan variants.\n`);
console.log(
  `${"CARRIER".padEnd(46)} ${"HAVE".padStart(5)} ${"OF".padStart(5)} ${"".padStart(6)}  SOURCE`,
);
let have = 0;
let total = 0;
for (const [carrier, r] of [...rows.entries()].sort((a, b) => b[1].have / b[1].total - a[1].have / a[1].total)) {
  have += r.have;
  total += r.total;
  const pct = `${Math.round((r.have / r.total) * 100)}%`;
  console.log(
    `${carrier.padEnd(46)} ${String(r.have).padStart(5)} ${String(r.total).padStart(5)} ${pct.padStart(6)}  ${r.source}`,
  );
}
console.log(
  `${"".padEnd(46)} ${"-----".padStart(5)} ${"-----".padStart(5)}`,
);
console.log(
  `${"TOTAL".padEnd(46)} ${String(have).padStart(5)} ${String(total).padStart(5)} ${`${Math.round((have / total) * 100)}%`.padStart(6)}`,
);
