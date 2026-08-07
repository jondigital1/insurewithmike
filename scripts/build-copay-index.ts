/**
 * Builds a single copay index keyed by plan id, merging what each carrier
 * makes available in a different shape.
 *
 *   Ambetter     per plan SBCs, addressed by plan id, so the join is exact
 *   UnitedHealthcare  the same, once you know their URL pattern
 *   Horizon      per plan SBCs, joined on plan name
 *   Oscar        one benefits grid, joined on plan name and cost sharing variant
 *   AmeriHealth  office visit copays stated in the plan name itself
 *
 * The output is what the engine and the browser bundle both read, so there is
 * one join, done once, rather than four join rules scattered through the code.
 *
 * Usage: npx tsx scripts/build-copay-index.ts [out.json]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadPlanDataset, copaysFromName } from "../src/puf.ts";

interface SbcRecord {
  source: string;
  planId: string | null;
  planName: string | null;
  primaryCare: number | null;
  specialist: number | null;
  primaryBeforeDeductible: boolean;
  specialistBeforeDeductible: boolean;
  primaryCoinsurance: number | null;
  specialistCoinsurance: number | null;
}

interface OscarRecord {
  planName: string;
  csrVariant: string;
  benefits: Record<string, string>;
}

export interface CopayEntry {
  primaryCare: number | null;
  specialist: number | null;
  /** True when the copay applies without the deductible being met first. */
  beforeDeductible: boolean;
  source: string;
  /**
   * Set when the summary of benefits was read and states a coinsurance
   * percentage for office visits rather than a flat copay.
   *
   * This is the difference between "this plan has no copay" and "we do not know
   * what this plan's copay is", which look identical if you only store the
   * amount. UnitedHealthcare's Silver Value coinsures office visits at 40 per
   * cent, so a null copay there is the answer, not a gap.
   */
  coinsuredInstead?: boolean;
}

const read = <T,>(p: string): T[] => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : []);
const sbc = read<SbcRecord>("data/sbc/copays-2026.json");
const oscar = read<OscarRecord>("data/sbc/oscar-copays-2026.json");

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Reads a grid cell such as "$15", "20% after deductible" or "$5 after ded".
 * Only a flat copay is usable; a coinsurance percentage is already handled by
 * the plan's own coinsurance rate.
 */
function gridCopay(cell: string | undefined): { amount: number | null; beforeDeductible: boolean } {
  if (!cell) return { amount: null, beforeDeductible: false };
  const afterDeductible = /after\s+ded/i.test(cell);
  const m = cell.match(/^\$\s?([\d,]+)/);
  if (!m) return { amount: null, beforeDeductible: false };
  return { amount: Number(m[1]!.replace(/,/g, "")), beforeDeductible: !afterDeductible };
}

const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);
const index: Record<string, CopayEntry> = {};

// Ambetter, joined on plan id.
const byPlanId = new Map(sbc.filter((s) => s.planId).map((s) => [s.planId as string, s]));

// Horizon and AmeriHealth, joined on plan name. Neither serves documents at a
// URL carrying the plan id, so the name is the only join available.
const byName = sbc.filter((s) => !s.planId && s.planName);
const horizonSbc = byName.filter((s) => !/^IHC\s/i.test(s.planName!));
const amerihealthSbc = byName.filter((s) => /^IHC\s/i.test(s.planName!));

for (const plan of dataset.plans) {
  const exact = byPlanId.get(plan.planId);
  if (
    exact &&
    (exact.primaryCare !== null ||
      exact.specialist !== null ||
      exact.primaryCoinsurance !== null)
  ) {
    index[plan.planId] = {
      primaryCare: exact.primaryCare,
      specialist: exact.specialist,
      beforeDeductible: exact.primaryBeforeDeductible,
      source: "sbc-by-plan-id",
      // A read that found a percentage rather than an amount is still a read.
      ...(exact.primaryCare === null && exact.primaryCoinsurance !== null
        ? { coinsuredInstead: true }
        : {}),
    };
    continue;
  }

  // AmeriHealth, joined on plan name, and read for timing rather than amount.
  //
  // Their marketing name states the two office visit copays outright, as in
  // "IHC Silver EPO AmeriHealth Advantage $25/$60", so the amounts are not in
  // doubt. Their SBC lays the table out with two provider columns and the
  // specialist figure rendering on the line above its own label, which makes
  // the forward read return the second column: $75 where the name says $60.
  // Taking the amount from the name and the deductible timing from the SBC uses
  // each source for the thing it states unambiguously, rather than picking a
  // winner between them.
  if (plan.issuerId === "91762") {
    const n = norm(plan.marketingName);
    const hit = amerihealthSbc.find((h) => {
      const hn = norm(h.planName!);
      return hn === n || n.includes(hn) || hn.includes(n);
    });
    if (hit) {
      const named = copaysFromName(plan.marketingName);
      const coinsured = named.primary === null && hit.primaryCoinsurance !== null;
      if (named.primary !== null || coinsured) {
        index[plan.planId] = {
          primaryCare: named.primary,
          specialist: named.specialist,
          beforeDeductible: hit.primaryBeforeDeductible,
          source: "sbc-timing-name-amount",
          ...(coinsured ? { coinsuredInstead: true } : {}),
        };
        continue;
      }
    }
  }

  if (plan.issuerId === "91661") {
    const n = norm(plan.marketingName);
    const hit = horizonSbc.find((h) => {
      const hn = norm(h.planName!);
      return hn === n || n.includes(hn) || hn.includes(n);
    });
    if (hit && (hit.primaryCare !== null || hit.specialist !== null)) {
      index[plan.planId] = {
        primaryCare: hit.primaryCare,
        specialist: hit.specialist,
        beforeDeductible: hit.primaryBeforeDeductible,
        source: "sbc-by-name",
      };
      continue;
    }
  }

  if (plan.issuerId === "23818") {
    const n = norm(plan.marketingName);
    const hit = oscar.find((o) => norm(o.planName) === n && o.csrVariant === plan.csrVariant);
    if (hit) {
      const pc = gridCopay(hit.benefits.primaryCare);
      const sp = gridCopay(hit.benefits.specialist);
      if (pc.amount !== null || sp.amount !== null) {
        index[plan.planId] = {
          primaryCare: pc.amount,
          specialist: sp.amount,
          beforeDeductible: pc.beforeDeductible,
          source: "benefits-grid",
        };
        continue;
      }
    }
  }

  // AmeriHealth state their office visit copays in the plan name.
  const named = copaysFromName(plan.marketingName);
  if (named.primary !== null) {
    index[plan.planId] = {
      primaryCare: named.primary,
      specialist: named.specialist,
      // The plan name states an amount but never says whether the deductible
      // applies first, so this is inferred rather than read. Health savings
      // account plans are assumed to charge it afterwards. That is no longer a
      // rule for bronze, which became HSA compatible in 2026 regardless of
      // deductible structure, but it is the conservative reading: it understates
      // the plan rather than crediting it with a copay it may not offer. The
      // fix is AmeriHealth's SBCs, not a better guess.
      beforeDeductible: !plan.hsaEligible,
      source: "plan-name",
    };
  }
}

const out = process.argv[2] ?? "data/sbc/copays-by-plan.json";
writeFileSync(out, JSON.stringify(index, null, 2), "utf8");

const rankable = dataset.plans.filter(
  (p) => p.csrVariant !== "zeroCostSharing" && p.csrVariant !== "limitedCostSharing",
);
const covered = rankable.filter((p) => index[p.planId]);
const bySource = new Map<string, number>();
for (const p of covered) {
  const s = index[p.planId]!.source;
  bySource.set(s, (bySource.get(s) ?? 0) + 1);
}
const beforeDed = covered.filter((p) => index[p.planId]!.beforeDeductible).length;

console.log(`\nCopay index written to ${out}`);
console.log(`  ${covered.length} of ${rankable.length} recommendable variants carry a copay`);
console.log(`  ${beforeDed} of those apply before the deductible, which is where they change the answer\n`);
for (const [s, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${s.padEnd(18)} ${n}`);
}
