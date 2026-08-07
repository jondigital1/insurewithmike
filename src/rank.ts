/**
 * Eligibility filtering and the good / better / best shortlist.
 *
 * The spread runs cheapest price to richest coverage, which is how the agent
 * presents options at the table. Selection is deterministic. A language model
 * may later narrate these results, but it does not choose them.
 */

import { fplPercentage } from "./assumptions.ts";
import { evaluateCost } from "./cost.ts";
import { issuerCounties } from "./puf.ts";
import type { SubsidyResult } from "./subsidy.ts";
import type {
  CsrVariant,
  Household,
  Plan,
  PlanDataset,
  PlanEvaluation,
} from "./types.ts";

/**
 * The silver cost sharing reduction variant a household qualifies for.
 *
 * This is not a choice. Income relative to the federal poverty level decides
 * it, and it changes the plan's deductible and out of pocket maximum
 * dramatically while leaving the premium unchanged. A household at 180 percent
 * of the poverty level buying a bronze plan to save premium is very often
 * making a costly mistake, because the 87 percent silver variant available to
 * them carries richer cost sharing than gold at a silver price.
 */
export function eligibleSilverVariant(household: Household): CsrVariant {
  const pct = fplPercentage(household.annualIncome, household.householdSize);
  if (pct < 150) return "csr94";
  if (pct < 200) return "csr87";
  if (pct < 250) return "csr73";
  return "standard";
}

/**
 * Catastrophic coverage is restricted to households where EVERY enrolling
 * member is under 30, or where an approved hardship or affordability
 * exemption is held. Testing "any member under 30" is wrong and will offer
 * catastrophic plans to any family with a child in it.
 */
function catastrophicEligible(household: Household): boolean {
  if (household.hardshipExemption) return true;
  return household.members.every((m) => m.age < 30);
}

/**
 * Reasons a plan cannot be sold to this household. An empty array means the
 * plan is a legitimate option.
 */
export function disqualifiersFor(
  dataset: PlanDataset,
  plan: Plan,
  household: Household,
): string[] {
  const reasons: string[] = [];

  const counties = issuerCounties(dataset, plan.issuerId);
  if (counties.size > 0 && !counties.has(household.county)) {
    reasons.push(`${plan.issuerName} does not sell in ${household.county} County`);
  }

  if (plan.csrVariant === "zeroCostSharing" || plan.csrVariant === "limitedCostSharing") {
    reasons.push(
      "Cost sharing variant restricted to members of federally recognised tribes",
    );
  }

  if (plan.metalLevel === "Silver") {
    const entitled = eligibleSilverVariant(household);
    if (plan.csrVariant !== entitled) {
      reasons.push(
        `Household qualifies for the ${describeVariant(entitled)} silver variant, not ${describeVariant(plan.csrVariant)}`,
      );
    }
  } else if (plan.csrVariant !== "standard") {
    reasons.push("Cost sharing reductions apply only to silver plans");
  }

  if (plan.metalLevel === "Catastrophic" && !catastrophicEligible(household)) {
    reasons.push(
      "Catastrophic coverage requires every enrolling member to be under 30, or an approved hardship exemption",
    );
  }

  return reasons;
}

function describeVariant(variant: CsrVariant): string {
  switch (variant) {
    case "csr94":
      return "94 percent";
    case "csr87":
      return "87 percent";
    case "csr73":
      return "73 percent";
    case "standard":
      return "standard";
    case "zeroCostSharing":
      return "zero cost sharing";
    case "limitedCostSharing":
      return "limited cost sharing";
  }
}

function notesFor(plan: Plan, household: Household): string[] {
  const notes: string[] = [];

  if (plan.deductibleIndividual === null) {
    notes.push("Deductible not filed in the public data, confirm with the carrier");
  }
  if (plan.coinsurance === null) {
    notes.push("Coinsurance not filed in the public data, confirm with the carrier");
  }
  if (plan.hasSecondNetworkTier) {
    notes.push(
      "Tiered network. Costs shown assume tier 1 providers. Confirm the client's doctors are tier 1",
    );
  }
  if (plan.hsaEligible) {
    notes.push("Health savings account eligible");
  }
  if (plan.metalLevel === "Catastrophic") {
    notes.push(
      "Catastrophic plans cannot use the premium tax credit, so a subsidised household usually pays more here despite the low list price",
    );
  }
  if (household.preferredHealthSystems.length > 0) {
    notes.push(
      `Network not yet verified against ${household.preferredHealthSystems.join(", ")}`,
    );
  }
  return notes;
}

export function evaluateAllPlans(
  dataset: PlanDataset,
  household: Household,
  quotedPremiums: Map<string, number> = new Map(),
  subsidy: SubsidyResult | null = null,
): PlanEvaluation[] {
  const results: PlanEvaluation[] = [];
  for (const plan of dataset.plans) {
    const cost = evaluateCost(
      dataset,
      plan,
      household,
      quotedPremiums.get(plan.planId) ?? null,
      subsidy,
    );
    if (!cost) continue;
    results.push({
      plan,
      cost,
      disqualifiers: disqualifiersFor(dataset, plan, household),
      notes: notesFor(plan, household),
    });
  }
  return results;
}

export type ShortlistTier = "good" | "better" | "best";

export interface ShortlistEntry {
  tier: ShortlistTier;
  label: string;
  rationale: string;
  evaluation: PlanEvaluation;
}

/**
 * Picks the good / better / best spread from the eligible plans.
 *
 * good    lowest expected annual total for the utilisation the client reported
 * better  best balance of expected cost against exposure if the year goes badly
 * best    lowest worst case total, meaning the most protection money can buy
 */
export function buildShortlist(
  evaluations: PlanEvaluation[],
  maxAlternates = 2,
): ShortlistEntry[] {
  const eligible = evaluations.filter((e) => e.disqualifiers.length === 0);
  if (eligible.length === 0) return [];

  const byExpected = [...eligible].sort(
    (a, b) => a.cost.estimatedAnnualTotal - b.cost.estimatedAnnualTotal,
  );
  const byWorstCase = [...eligible].sort(
    (a, b) => a.cost.worstCaseAnnualTotal - b.cost.worstCaseAnnualTotal,
  );
  const byBalance = [...eligible].sort((a, b) => balanceScore(a) - balanceScore(b));

  // Each tier must land on a different plan. Without this, a plan that is both
  // the cheapest and the safest silently swallows two of the three slots and
  // the agent sees a shortlist with no spread in it.
  const good = byExpected[0];
  const best = byWorstCase.find((e) => e !== good) ?? byWorstCase[0];
  const better = byBalance.find((e) => e !== good && e !== best) ?? undefined;

  const picks: ShortlistEntry[] = [];
  const seen = new Set<string>();

  const add = (tier: ShortlistTier, entry: PlanEvaluation | undefined, rationale: string) => {
    if (!entry || seen.has(entry.plan.planId)) return;
    seen.add(entry.plan.planId);
    picks.push({
      tier,
      label: `${entry.plan.issuerName} ${entry.plan.marketingName}`,
      rationale,
      evaluation: entry,
    });
  };

  add(
    "good",
    good,
    "Lowest total cost if the year goes as the client expects. Cheapest option that still covers them.",
  );
  add(
    "better",
    better,
    "Best balance between what they will probably spend and what they could spend if the year goes badly.",
  );
  add(
    "best",
    best,
    "Lowest possible exposure in a bad year. The most protection available to this household.",
  );

  // Fill out to five with the next best expected cost options from carriers
  // not already represented, so the client sees genuine alternatives rather
  // than three versions of the same network.
  const represented = new Set(picks.map((p) => p.evaluation.plan.issuerId));
  let added = 0;
  for (const candidate of byExpected) {
    if (added >= maxAlternates) break;
    if (seen.has(candidate.plan.planId)) continue;
    if (represented.has(candidate.plan.issuerId)) continue;
    represented.add(candidate.plan.issuerId);
    added += 1;
    add(
      "better",
      candidate,
      `Alternative from ${candidate.plan.issuerName}, included so the client sees a different network.`,
    );
  }

  return picks;
}

/**
 * Weighs expected cost against downside exposure. The quarter weighting on the
 * gap between expected and worst case is a starting heuristic, not a
 * calibrated figure. It should be tuned against real cases from Mike.
 */
function balanceScore(e: PlanEvaluation): number {
  const gap = e.cost.worstCaseAnnualTotal - e.cost.estimatedAnnualTotal;
  return e.cost.estimatedAnnualTotal + gap * 0.25;
}
