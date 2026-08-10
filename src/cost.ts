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
  CoverageScenario,
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

/**
 * The allowed charges behind each standardised SBC scenario, as set by CMS for
 * the coverage example calculation. These are the x coordinates of the filed
 * points: every issuer computed "the member pays" against these totals.
 */
const SCENARIO_ALLOWED: Record<CoverageScenario, number> = {
  simpleFracture: 2800,
  managingDiabetes: 5600,
  havingABaby: 12700,
};

/**
 * Out of pocket estimated from the issuer's own filed coverage examples,
 * rather than from our simulation.
 *
 * Calibration against all standard variants (docs/research-2026-08.md) showed
 * the simulation overstating members' costs by a mean of $725 on expanded
 * bronze and $641 on silver, because the New Jersey filings carry no copay
 * amounts and a visit we cannot price by copay falls into the deductible at
 * full charge. The issuer's filed examples do not have that blindness: they
 * were computed by the carrier with the plan's real copays, limits and
 * exclusions in hand.
 *
 * So where a plan carries its examples, we treat them as three measured points
 * on the plan's cost sharing curve, anchor the curve at zero, extend it toward
 * the out of pocket maximum, and read our household's figure off it by linear
 * interpolation on allowed charges.
 *
 * This is an approximation with a known wrinkle: the scenarios differ in mix,
 * not just in size. Having a baby is inpatient heavy, managing diabetes is
 * drug heavy, so the curve is not strictly a function of allowed charges. Two
 * defences. The points are forced monotone before use, so a plan whose
 * diabetes example exceeds its baby example cannot produce an out of pocket
 * that falls as care rises. And the exact scenario match still wins upstream,
 * so interpolation only ever fills the space between scenarios, where any
 * error is bounded by the filed points on either side.
 *
 * Measured honestly (leave one out across the 39 base plans): a straight line
 * from the fracture point to the baby point misses the held out diabetes
 * point by a mean of $830, slightly worse than the simulation's $712 at that
 * same point. That is the widest span the curve ever has to bridge; the real
 * curve keeps the middle point, so its segments are half that width and the
 * curvature error correspondingly smaller. The trade is: exact at three
 * measured points and near them, roughly simulation grade at the middle of a
 * segment, against a simulation that runs $500 to $750 hot on bronze and
 * silver everywhere. See docs/research-2026-08.md for the calibration.
 *
 * Returns null when the plan has no usable examples, and the caller falls
 * back to the simulation.
 */
export function interpolatedOutOfPocket(
  plan: Plan,
  allowedCharges: number,
  isFamily: boolean,
): number | null {
  const points: Array<[number, number]> = [[0, 0]];
  for (const [scenario, allowed] of Object.entries(SCENARIO_ALLOWED) as [
    CoverageScenario,
    number,
  ][]) {
    const example = plan.coverageExamples[scenario];
    if (example) points.push([allowed, example.total]);
  }
  if (points.length < 3) return null; // one example is a point, not a curve

  points.sort((a, b) => a[0] - b[0]);

  // Force the curve monotone non decreasing: more care can not cost less.
  // Differences between scenario mixes occasionally file that way, and letting
  // it through would rank plans on an artefact.
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const here = points[i]!;
    if (here[1] < prev[1]) here[1] = prev[1];
  }

  const moop =
    (isFamily ? plan.moopFamily : plan.moopIndividual) ?? plan.moopIndividual ?? Infinity;

  const last = points[points.length - 1]!;
  if (allowedCharges >= last[0]) {
    // Beyond the largest scenario, continue at the curve's final slope until
    // the out of pocket maximum caps it. The slope past the deductible region
    // is the coinsurance share, and the last segment is our best measure of it.
    const prev = points[points.length - 2]!;
    const slope = (last[1] - prev[1]) / (last[0] - prev[0]);
    return Math.min(moop, last[1] + Math.max(0, slope) * (allowedCharges - last[0]));
  }

  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1]!;
    const [x2, y2] = points[i]!;
    if (allowedCharges <= x2) {
      const t = x2 === x1 ? 0 : (allowedCharges - x1) / (x2 - x1);
      return Math.min(moop, y1 + t * (y2 - y1));
    }
  }
  return Math.min(moop, last[1]);
}

export function evaluateCost(
  dataset: PlanDataset,
  plan: Plan,
  household: Household,
  quotedMonthlyPremium: number | null = null,
  subsidy: SubsidyResult | null = null,
  /**
   * What standalone pediatric dental costs this household for the year, from
   * dental.ts. Applied only to plans that do not already include children's
   * dental, which is 152 of the 176 New Jersey plans.
   *
   * Passed in as a number rather than computed here because it is the same for
   * every plan and depends only on the household, so pricing it once per
   * household beats pricing it 176 times. Zero when there are no children, and
   * zero when the dental filings are not loaded, which keeps every existing
   * caller behaving exactly as it did.
   */
  pediatricDentalFloor = 0,
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

  // No exact scenario match: read the figure off the plan's own filed curve
  // before falling back to the simulation. Calibration showed the simulation
  // running $500 to $750 hot on bronze and silver for want of copay data; the
  // filed points carry the copays we cannot see. The simulation still supplies
  // the itemised workings below, which is fine, because they are shown as the
  // route to a figure rather than being the figure.
  const interpolated = filed ? null : interpolatedOutOfPocket(plan, allowed, isFamily);

  const outOfPocket = filed ? filed.total : interpolated ?? sharing.outOfPocket;
  const outOfPocketSource: "filed" | "interpolated" | "simulated" = filed
    ? "filed"
    : interpolated !== null
      ? "interpolated"
      : "simulated";

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

  // A plan that includes children's dental and one that does not are not the
  // same purchase, and until this line existed the totals compared them as
  // though they were. Only 24 New Jersey plans include it, all UnitedHealthcare,
  // so the omission ran one way: against the only carrier that bundles it.
  const pediatricDentalPremium = plan.embedsPediatricDental ? 0 : pediatricDentalFloor;

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
    // A figure taken from the issuer's filing, exactly or by interpolation,
    // already accounts for copays. Only the simulation can be short of one.
    copaysKnown: filed || interpolated !== null ? true : sharing.copaysKnown,
    estimatedOutOfPocket: outOfPocket,
    outOfPocketSource,
    reachesMoop: sharing.reachesMoop,
    pediatricDentalPremium,
    estimatedAnnualTotal: effectivePremium + outOfPocket + pediatricDentalPremium,
    worstCaseAnnualTotal: effectivePremium + moop + pediatricDentalPremium,
  };
}




