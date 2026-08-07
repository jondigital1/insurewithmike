/**
 * Reviews what the engine produced, and where an agent disagreed with it.
 *
 * Usage: npx tsx scripts/review.ts [dbfile]
 */

import { Store } from "../src/store/db.ts";

const store = new Store({ file: process.argv[2] ?? "data/testing.sqlite" });
const usd = (n: number) =>
  Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const rule = (s: string) => console.log("\n" + s + "\n" + "-".repeat(s.length));

rule("WHAT THE ENGINE IS RECOMMENDING");

const composition = store.query<{ tier: string; metal_level: string; n: number }>(
  `SELECT tier, metal_level, COUNT(*) AS n FROM shortlist_entry GROUP BY tier, metal_level ORDER BY tier, n DESC`,
);
console.log(`\n${"TIER".padEnd(9)} ${"METAL".padEnd(18)} ${"COUNT".padStart(6)}`);
for (const c of composition) {
  console.log(`${c.tier.padEnd(9)} ${c.metal_level.padEnd(18)} ${String(c.n).padStart(6)}`);
}

const topPicks = store.query<{ issuer_name: string; marketing_name: string; n: number }>(
  `SELECT issuer_name, marketing_name, COUNT(*) AS n
     FROM shortlist_entry WHERE rank = 1
     GROUP BY issuer_name, marketing_name ORDER BY n DESC`,
);
console.log(`\nPlans landing in the top slot, across every household:`);
for (const p of topPicks) {
  console.log(`  ${String(p.n).padStart(3)}x  ${p.issuer_name.split(" ")[0]?.padEnd(14)} ${p.marketing_name}`);
}
if (topPicks.length === 1) {
  console.log(
    `\n  WARNING: a single plan takes the top slot in every case. That is a signal about the\n  cost model, not about the market. See the calibration note below.`,
  );
}

rule("CONCENTRATION CHECK");

const runs = store.query<{ n: number }>(`SELECT COUNT(*) AS n FROM recommendation_run`)[0]?.n ?? 0;
const distinctTop = store.query<{ n: number }>(
  `SELECT COUNT(DISTINCT plan_id) AS n FROM shortlist_entry WHERE rank = 1`,
)[0]?.n ?? 0;
const distinctAny = store.query<{ n: number }>(
  `SELECT COUNT(DISTINCT plan_id) AS n FROM shortlist_entry`,
)[0]?.n ?? 0;
console.log(`\n  households run                 ${runs}`);
console.log(`  distinct plans in the top slot ${distinctTop}`);
console.log(`  distinct plans recommended     ${distinctAny} of 39 base plans`);
console.log(
  `\n  If the engine only ever reaches for a handful of plans, either the market really is\n  that lopsided or the model is missing something. Right now it is missing copays.`,
);

rule("AGENT DISAGREEMENT");

const reviews = store.query<{ n: number; followed: number }>(
  `SELECT COUNT(*) AS n, COALESCE(SUM(followed_engine), 0) AS followed FROM agent_review`,
)[0];
if (!reviews || reviews.n === 0) {
  console.log(
    `\n  No agent reviews recorded yet.\n\n  This is the table that matters. Until Mike marks up real shortlists, everything above\n  describes what the engine believes, and nothing describes whether it is any good.`,
  );
} else {
  const rate = ((reviews.followed / reviews.n) * 100).toFixed(0);
  console.log(`\n  reviews recorded      ${reviews.n}`);
  console.log(`  agent led with our top pick  ${reviews.followed} of ${reviews.n}  (${rate}%)`);
  const reasons = store.query<{ override_reason: string; n: number }>(
    `SELECT override_reason, COUNT(*) AS n FROM agent_review
       WHERE followed_engine = 0 AND override_reason IS NOT NULL
       GROUP BY override_reason ORDER BY n DESC`,
  );
  if (reasons.length) {
    console.log(`\n  Why the agent went elsewhere:`);
    for (const r of reasons) console.log(`    ${String(r.n).padStart(3)}x  ${r.override_reason}`);
  }
}

rule("SUBSIDY CLIFF, OBSERVED");

const cliff = store.query<{ notes: string; fpl_percentage: number; federal_subsidy: number }>(
  `SELECT sub.notes, r.fpl_percentage, r.federal_subsidy
     FROM recommendation_run r JOIN submission sub ON sub.id = r.submission_id
     ORDER BY r.fpl_percentage`,
);
console.log(`\n${"FPL".padStart(7)} ${"SUBSIDY".padStart(10)}  HOUSEHOLD`);
for (const c of cliff) {
  console.log(
    `${`${c.fpl_percentage.toFixed(0)}%`.padStart(7)} ${usd(c.federal_subsidy).padStart(10)}  ${(c.notes ?? "").slice(0, 66)}`,
  );
}

rule("VERSION STAMPS IN USE");

const versions = store.query<{
  engine_version: string;
  plan_data_version: string;
  assumptions_version: string;
  n: number;
}>(
  `SELECT engine_version, plan_data_version, assumptions_version, COUNT(*) AS n
     FROM recommendation_run GROUP BY 1, 2, 3`,
);
for (const v of versions) {
  console.log(
    `\n  engine ${v.engine_version}   plan data ${v.plan_data_version}   assumptions ${v.assumptions_version}   (${v.n} runs)`,
  );
}

console.log(
  `\n  CALIBRATION NOTE. The cost model runs every service through the deductible and then\n  coinsurance, because the New Jersey filings carry no copay amounts. That systematically\n  flatters low premium, high deductible plans, since it cannot see the flat copays that\n  make a richer plan worth having for a moderate user. Expect the shortlist to lean\n  bronze until that gap is closed against the filed coverage examples.`,
);

store.close();
