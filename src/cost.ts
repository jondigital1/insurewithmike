/**
 * Deterministic cost model.
 *
 * Given a household's expected utilization and a plan's filed cost sharing,
 * this produces the same answer every time. No language model is involved in
 * producing any number here, which is what makes the output reproducible and
 * auditable when a licensed agent signs their name to it.
 */

import { ALLOWED_AMOUNTS } from "./assumptions.ts";
import { monthlyListPremium } from "./premium.ts";
import { netAnnualPremium, njHealthPlanSavings, type SubsidyResult } from "./subsidy.ts";
import type {
  CostBreakdown,
  Household,
  Plan,
  PlanDataset,
  ServiceCategory,
  TierPenalty,
} from "./types.ts";

export { monthlyListPremium };

/**
 * Estimated allowed charges for the year across the whole household.
 *
 * This is what the care is priced at before the plan and the member split it,
 * not what anybody pays. See assumptions.ts for the confidence level on the
 * unit prices, which is currently low.
 */
export function estimatedAllowedCharges(household: Household): number {
  let total = 0;
  for (const member of household.members) {
    for (const [category, count] of Object.entries(member.utilization) as [
      ServiceCategory,
      number,
    ][]) {
      total += (ALLOWED_AMOUNTS[category] ?? 0) * (count ?? 0);
    }
  }
  return total;
}

/** Allowed charges broken out by category, for showing the agent the workings. */
export function allowedChargesByCategory(
  household: Household,
): Array<{ category: ServiceCategory; units: number; allowed: number }> {
  const totals = new Map<ServiceCategory, number>();
  for (const member of household.members) {
    for (const [category, count] of Object.entries(member.utilization) as [
      ServiceCategory,
      number,
    ][]) {
      totals.set(category, (totals.get(category) ?? 0) + (count ?? 0));
    }
  }
  return [...totals.entries()]
    .filter(([, units]) => units > 0)
    .map(([category, units]) => ({
      category,
      units,
      allowed: (ALLOWED_AMOUNTS[category] ?? 0) * units,
    }))
    .sort((a, b) => b.allowed - a.allowed);
}

interface CostSharingResult {
  deductibleApplied: number;
  coinsuranceApplied: number;
  copayApplied: number;
  outOfPocket: number;
  reachesMoop: boolean;
  /**
   * Whether a copay amount was actually available for the visits this household
   * makes. False means the visits were priced at their full allowed charge
   * against the deductible, which is an overstatement rather than an answer.
   */
  copaysKnown: boolean;
}

/**
 * Applies copays, then the deductible, then coinsurance, then caps at the out
 * of pocket maximum.
 *
 * The New Jersey filings carry no copay amounts. Where we have recovered them
 * from a carrier's own summary of benefits they are applied; where we have not,
 * the visit stays in the deductible base and the figure is an overstatement for
 * a light utiliser on a copay heavy plan. `copaysKnown` reports which happened,
 * so a page can say so rather than implying a precision it does not have.
 */
/** Office visits that a plan meters by flat copay rather than by coinsurance. */
export interface CopayMeteredVisits {
  primaryCareVisits?: number;
  specialistVisits?: number;
}

export function applyCostSharing(
  plan: Plan,
  allowedCharges: number,
  isFamily: boolean,
  visits?: CopayMeteredVisits,
): CostSharingResult {
  const deductible =
    (isFamily ? plan.deductibleFamily : plan.deductibleIndividual) ??
    plan.deductibleIndividual ??
    0;
  const moop =
    (isFamily ? plan.moopFamily : plan.moopIndividual) ?? plan.moopIndividual ?? Infinity;
  const coinsuranceRate = plan.coinsurance ?? 0;

  // Office visits metered by a flat copay sit outside the deductible entirely,
  // which is exactly the mechanism the model was blind to. Their allowed cost
  // comes out of the base before the deductible is applied, and the member pays
  // the copay instead.
  //
  // copayBeforeDeductible carries the plan's own summary of benefits saying
  // "deductible does not apply", so it is evidence rather than an assumption
  // and it decides this on its own.
  //
  // It used to be gated on the plan not being health savings account eligible,
  // on the reasoning that federal rules bar an HDHP from paying anything before
  // the deductible except preventive care. That stopped being true on 1 January
  // 2026: section 71306 of the 2025 reconciliation act, and IRS Notice 2026-05,
  // make every bronze and catastrophic plan HSA compatible regardless of
  // whether it meets the general HDHP definition. UnitedHealthcare's 2026
  // bronze plans are filed HSA eligible and their SBCs state a $50 primary care
  // copay with the deductible not applying. Both are correct, and the old guard
  // suppressed a copay the member really does pay.
  //
  // The guard is kept for other metal levels, where HSA eligibility still
  // implies a true HDHP and a copay reading would mean the parser erred.
  const hsaBarsCopay =
    plan.hsaEligible &&
    plan.metalLevel !== "Bronze" &&
    plan.metalLevel !== "Expanded Bronze" &&
    plan.metalLevel !== "Catastrophic";

  let copayApplied = 0;
  let base = allowedCharges;
  let copaysKnown = true;
  if (visits && !hsaBarsCopay && plan.copayBeforeDeductible) {
    const pcp = visits.primaryCareVisits ?? 0;
    const spec = visits.specialistVisits ?? 0;
    if (pcp > 0) {
      if (plan.copayPrimaryCare === null) copaysKnown = plan.copaysRead;
      else {
        copayApplied += pcp * plan.copayPrimaryCare;
        base -= pcp * ALLOWED_AMOUNTS.primaryCareVisit;
      }
    }
    if (spec > 0) {
      if (plan.copaySpecialist === null) copaysKnown = copaysKnown && plan.copaysRead;
      else {
        copayApplied += spec * plan.copaySpecialist;
        base -= spec * ALLOWED_AMOUNTS.specialistVisit;
      }
    }
    base = Math.max(0, base);
  } else if (visits && !hsaBarsCopay) {
    // The plan does not meter visits by copay before the deductible, or we do
    // not know that it does. The figure below is then the deductible answer.
    // That is the right answer when we read the schedule and it said so, and an
    // overstatement when we simply hold nothing for this plan.
    const hasVisits = (visits.primaryCareVisits ?? 0) > 0 || (visits.specialistVisits ?? 0) > 0;
    copaysKnown = !hasVisits || plan.copaysRead;
  }

  const deductibleApplied = Math.min(base, deductible);
  const afterDeductible = Math.max(0, base - deductible);
  const coinsuranceApplied = afterDeductible * coinsuranceRate;

  const uncapped = deductibleApplied + coinsuranceApplied + copayApplied;
  const outOfPocket = Math.min(uncapped, moop);

  return {
    deductibleApplied,
    coinsuranceApplied,
    copayApplied,
    outOfPocket,
    reachesMoop: uncapped >= moop && Number.isFinite(moop),
    copaysKnown,
  };
}

/**
 * What a tiered plan costs if the client's care goes to a second tier provider.
 *
 * Every comparison screen, including ours, quotes the tier 1 deductible and out
 * of pocket maximum, because that is the headline figure the issuer files. A
 * client whose hospital sits in tier 2 pays the tier 2 numbers instead, and
 * nothing tells them until a bill arrives.
 *
 * We cannot say which tier a given hospital is in. Horizon's published tier
 * list is dated October 2017 and hospitals have moved since, so answering from
 * it would be a confident wrong answer about a financial decision. What we can
 * do is price the risk, so the agent knows how much the question is worth
 * before picking up the phone to check.
 */
export function tierPenalty(plan: Plan): TierPenalty | null {
  if (!plan.hasSecondNetworkTier) return null;

  const t1Ded = plan.deductibleIndividual ?? 0;
  const t2Ded = plan.deductibleIndividualTier2 ?? t1Ded;
  const t1Moop = plan.moopIndividual ?? 0;
  const t2Moop = plan.moopIndividualTier2 ?? t1Moop;

  const extraDeductible = Math.max(0, t2Ded - t1Ded);
  const extraWorstCase = Math.max(0, t2Moop - t1Moop);

  return {
    extraDeductible,
    extraWorstCase,
    nominalOnly: extraDeductible === 0 && extraWorstCase === 0,
  };
}

export function evaluateCost(
  dataset: PlanDataset,
  plan: Plan,
  household: Household,
  quotedMonthlyPremium: number | null = null,
  subsidy: SubsidyResult | null = null,
): CostBreakdown | null {
  const listMonthly = monthlyListPremium(dataset, plan, household);
  if (listMonthly === null) return null;

  const isFamily = household.members.length > 1;

  // Coverage starting part way through the year scales the premium and the
  // amount of care, but not the deductible or the out of pocket maximum, which
  // reset annually regardless of when someone joins. Ignoring this makes high
  // deductible plans look better than they are for anyone enrolling mid year.
  const months = Math.max(1, Math.min(12, household.monthsOfCoverage ?? 12));
  const yearFraction = months / 12;

  const allowed = estimatedAllowedCharges(household) * yearFraction;

  // Office visits the plan may meter by a flat copay rather than by
  // coinsurance. Counted here and handed over; applyCostSharing decides whether
  // this particular plan works that way, and leaves them in the deductible base
  // when it does not.
  //
  // Passing these is not optional detail. Without them a household whose care
  // costs less than the deductible pays the full allowed amount on every plan,
  // so a $5,000 deductible and a $12,000 deductible produce the same figure and
  // the whole comparison collapses to the premium.
  const countVisits = (category: ServiceCategory): number =>
    household.members.reduce((n, m) => n + (m.utilization[category] ?? 0), 0) * yearFraction;
  const sharing = applyCostSharing(plan, allowed, isFamily, {
    primaryCareVisits: countVisits("primaryCareVisit"),
    specialistVisits: countVisits("specialistVisit"),
  });

  // When the client's year matches one of the standardised coverage examples,
  // prefer the issuer's own filed figure over our simulation. The filing has
  // already accounted for copays, limits and exclusions, none of which the
  // simulation can see, and testing against all 102 non tribal variants showed
  // the simulation misranks exactly the plans that meter care by copay.
  const filed = household.expectedScenario
    ? plan.coverageExamples[household.expectedScenario]
    : null;
  const outOfPocket = filed ? filed.total : sharing.outOfPocket;
  const outOfPocketSource: "filed" | "simulated" = filed ? "filed" : "simulated";

  const annualPremiumListed = listMonthly * months;
  const afterFederal = subsidy
    ? netAnnualPremium(plan, annualPremiumListed, subsidy, months)
    : annualPremiumListed;
  const federalSubsidyApplied = annualPremiumListed - afterFederal;

  // The state subsidy stacks on the federal credit rather than reducing it,
  // which is what DOBI states, so it comes off afterwards. It cannot take the
  // premium below zero.
  const state = njHealthPlanSavings(household, plan.metalLevel, household.members.length);
  const stateSubsidyApplied = Math.min(afterFederal, state.annualAmount * yearFraction);
  const annualPremiumNet = Math.max(0, afterFederal - stateSubsidyApplied);
  const annualPremiumQuoted =
    quotedMonthlyPremium === null ? null : quotedMonthlyPremium * 12;
  // The agent's quoted figure still wins when supplied. Ours estimates the
  // state subsidy from a published average; GetCoveredNJ computes the exact
  // entitlement, so its number is the better one whenever it exists.
  const effectivePremium = annualPremiumQuoted ?? annualPremiumNet;

  const moop =
    (isFamily ? plan.moopFamily : plan.moopIndividual) ?? plan.moopIndividual ?? 0;

  return {
    tierTwoPenalty: tierPenalty(plan),
    annualPremiumListed,
    federalSubsidyApplied,
    stateSubsidyApplied,
    annualPremiumNet,
    annualPremiumQuoted,
    estimatedAllowedCharges: allowed,
    deductibleApplied: sharing.deductibleApplied,
    coinsuranceApplied: sharing.coinsuranceApplied,
    copayApplied: sharing.copayApplied,
    // A filed coverage example already accounts for copays, so it is never in
    // doubt. Only the simulation can be short of a copay amount.
    copaysKnown: filed ? true : sharing.copaysKnown,
    estimatedOutOfPocket: outOfPocket,
    outOfPocketSource,
    reachesMoop: sharing.reachesMoop,
    estimatedAnnualTotal: effectivePremium + outOfPocket,
    worstCaseAnnualTotal: effectivePremium + moop,
  };
}




