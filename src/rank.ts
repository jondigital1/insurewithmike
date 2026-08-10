/**
 * Eligibility filtering and the good / better / best shortlist.
 *
 * The spread runs cheapest price to richest coverage, which is how the agent
 * presents options at the table. Selection is deterministic. A language model
 * may later narrate these results, but it does not choose them.
 */

import { fplPercentage } from "./assumptions.ts";
import { evaluateCost, tierPenalty } from "./cost.ts";
import { issuerCounties } from "./dataset.ts";
import { pediatricDentalGap } from "./dental.ts";
import type { SubsidyResult } from "./subsidy.ts";
import type {
  CsrVariant,
  DentalDataset,
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

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function notesFor(plan: Plan, household: Household): string[] {
  const notes: string[] = [];

  if (plan.deductibleIndividual === null) {
    notes.push("Deductible not filed in the public data, confirm with the carrier");
  }
  if (plan.coinsurance === null) {
    notes.push("Coinsurance not filed in the public data, confirm with the carrier");
  }

  // Tiering is only worth a conversation when it costs something. Six of the
  // eleven tiered plans in this market file identical numbers for both tiers,
  // so warning about all of them buries the four that matter.
  const tier = tierPenalty(plan);
  if (tier?.nominalOnly) {
    notes.push(
      "Files a second network tier, but with identical deductible and out of pocket maximum, so which tier a provider sits in costs nothing here",
    );
  } else if (tier) {
    const parts: string[] = [];
    if (tier.extraDeductible > 0) parts.push(`${money(tier.extraDeductible)} more deductible`);
    if (tier.extraWorstCase > 0) parts.push(`${money(tier.extraWorstCase)} more exposure in a bad year`);
    notes.push(
      `Tiered network, and it costs real money: a tier 2 provider means ${parts.join(" and ")}. Figures below assume tier 1, so check the client's hospital before quoting this one`,
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
  /**
   * The dental filings, when loaded. Used only to price the pediatric dental a
   * household must buy separately on the plans that do not include it. Omitting
   * it leaves every total exactly as it was before dental existed, which is
   * what every caller that does not care about dental should get.
   */
  dentalDataset: DentalDataset | null = null,
): PlanEvaluation[] {
  // Priced once for the household rather than once per plan: the figure depends
  // on the children's ages and the length of the plan year, neither of which
  // varies across the 176 plans. Which plans it is then applied to does vary.
  const pediatricFloor =
    dentalDataset === null ? 0 : pediatricDentalGap(dentalDataset, household, false);

  const results: PlanEvaluation[] = [];
  for (const plan of dataset.plans) {
    const cost = evaluateCost(
      dataset,
      plan,
      household,
      quotedPremiums.get(plan.planId) ?? null,
      subsidy,
      pediatricFloor,
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

/**
 * Another plan close enough to this pick that the ranking between them is
 * arithmetic noise rather than a finding.
 */
export interface TieNote {
  planId: string;
  label: string;
  /** Dollars per year separating the two. Positive means the other plan costs more. */
  gapAnnual: number;
  /** What actually differs, since the money does not: network, metal, design. */
  differences: string[];
  /** True when the tied plan also appears on the shortlist. */
  onShortlist: boolean;
}

export interface ShortlistEntry {
  tier: ShortlistTier;
  label: string;
  rationale: string;
  evaluation: PlanEvaluation;
  /**
   * Plans within TIE_THRESHOLD of this pick on the measure that earned it its
   * slot. Sensitivity testing (docs/research-2026-08.md) found gaps under a
   * few hundred dollars a year inside the honest error bar of everything
   * upstream: interpolated cost curves, estimated utilisation, an averaged
   * state subsidy. Presenting such a gap as a ranking implies a confidence
   * the engine does not have, so the tie is surfaced and the real
   * differences, which are about networks and plan design, are named.
   */
  ties: TieNote[];
}

/**
 * Two plans within this many dollars a year are presented as equivalent.
 *
 * From the fragility measurement: 7 of 48 tested households had a first to
 * second gap under $250, and the measured model error at the filed points it
 * interpolates between runs to several hundred dollars. A gap smaller than
 * the model's own error bar is not a preference.
 */
export const TIE_THRESHOLD = 250;

/** The differences worth naming when the money cannot decide. */
function tiebreakDifferences(a: Plan, b: Plan): string[] {
  const out: string[] = [];
  if (a.issuerName !== b.issuerName) {
    out.push(`${b.issuerName.split(" ")[0]} network instead of ${a.issuerName.split(" ")[0]}`);
  }
  if (a.metalLevel !== b.metalLevel) out.push(`${b.metalLevel} instead of ${a.metalLevel}`);
  if (a.planType !== b.planType) out.push(`${b.planType} instead of ${a.planType}`);
  if (a.hsaEligible !== b.hsaEligible) {
    out.push(b.hsaEligible ? "HSA eligible where this one is not" : "not HSA eligible where this one is");
  }
  const da = a.deductibleIndividual, db = b.deductibleIndividual;
  if (da !== null && db !== null && Math.abs(da - db) >= 500) {
    out.push(`a ${db > da ? "higher" : "lower"} deductible (${money(db)} against ${money(da)})`);
  }
  if (!out.length) out.push("nearly identical designs; check the drug list and the client's providers");
  return out;
}

/**
 * Picks the good / better / best spread from the eligible plans.
 *
 * good    lowest expected annual total for the utilisation the client reported
 * better  best balance of expected cost against exposure if the year goes badly
 * best    lowest worst case total, meaning the most protection money can buy
 */
/**
 * The intake slugs for carriers against how their issuer names begin, which
 * is stable across the marketing suffixes ("from WellCare", "/ Oxford").
 */
const INSURER_SLUG_PREFIX: Record<string, string> = {
  horizon: "horizon",
  amerihealth: "amerihealth",
  oscar: "oscar",
  unitedhealthcare: "unitedhealthcare",
  ambetter: "ambetter",
};

export interface ShortlistContext {
  /** Intake slug of the carrier insuring the household today. */
  currentInsurer?: string;
  /** How they feel about that carrier. Absent reads as neutral. */
  currentInsurerFeeling?: "keep" | "neutral" | "leave";
}

export function buildShortlist(
  evaluations: PlanEvaluation[],
  maxAlternates = 2,
  context: ShortlistContext = {},
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
      ties: [],
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

  // The staying-put slot. Many renewal conversations open with "can I just
  // keep what I have?", and the answer should already be on the page: the
  // best plan from the carrier they hold today, labelled as exactly that.
  //
  // Sentiment decides whether the slot exists, not whether the carrier is
  // ranked. A client who wants out suppresses the card, because leading with
  // the carrier they are leaving wastes the page's scarcest space; their
  // carrier's plans still compete for every other slot and sit in the full
  // table, priced, so the cost of the aversion stays visible. A client who
  // wants to stay gets the card even when the carrier placed nowhere, which
  // is precisely when the conversation needs it most.
  if (context.currentInsurer && context.currentInsurerFeeling !== "leave") {
    const prefix = INSURER_SLUG_PREFIX[context.currentInsurer];
    const represented = picks.some((p) =>
      p.evaluation.plan.issuerName.toLowerCase().startsWith(prefix ?? " "),
    );
    if (prefix && !represented) {
      const own = byExpected.find((e) =>
        e.plan.issuerName.toLowerCase().startsWith(prefix),
      );
      add(
        "better",
        own,
        context.currentInsurerFeeling === "keep"
          ? "What staying with their current carrier looks like. They said they would rather stay if the numbers work, so this is the plan those numbers describe."
          : "What staying with their current carrier looks like: their carrier's strongest option for this household, here because the renewal conversation usually starts from it.",
      );
    }
  }

  // Ties are computed once the shortlist is settled, and only for the two
  // slots that claim superiority: "good" claims cheapest and "best" claims
  // safest, each on its own measure. The alternates claim nothing except
  // being a different network, so a near neighbour is not evidence against
  // them and gets no banner. One tie per pick, the closest; in a market of
  // nearly forty plans most of them have some neighbour within the
  // threshold, and a banner on every card would say nothing on any of them.
  for (const pick of picks) {
    if (pick.tier === "better") continue;
    const measure = (e: PlanEvaluation) =>
      pick.tier === "best" ? e.cost.worstCaseAnnualTotal : e.cost.estimatedAnnualTotal;
    const mine = measure(pick.evaluation);
    pick.ties = eligible
      .filter((e) => e.plan.planId !== pick.evaluation.plan.planId)
      .map((e) => ({ e, gap: measure(e) - mine }))
      .filter(({ gap }) => Math.abs(gap) < TIE_THRESHOLD)
      .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
      .slice(0, 1)
      .map(({ e, gap }) => ({
        planId: e.plan.planId,
        label: `${e.plan.issuerName.split(" ")[0]} ${e.plan.marketingName}`,
        gapAnnual: Math.round(gap),
        differences: tiebreakDifferences(pick.evaluation.plan, e.plan),
        onShortlist: seen.has(e.plan.planId),
      }));
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


