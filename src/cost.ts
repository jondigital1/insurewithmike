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
import { netAnnualPremium, type SubsidyResult } from "./subsidy.ts";
import type {
  CostBreakdown,
  Household,
  Plan,
  PlanDataset,
  ServiceCategory,
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
  outOfPocket: number;
  reachesMoop: boolean;
}

/**
 * Applies deductible, then coinsurance, then caps at the out of pocket maximum.
 *
 * KNOWN LIMITATION: real plans meter many services by fixed copay rather than
 * by coinsurance, and copays often apply before the deductible is met. The New
 * Jersey filings we hold do not carry copay amounts, so everything is modelled
 * as deductible then coinsurance. This overstates cost for low utilisers on
 * copay heavy plans and understates the value of a rich plan's flat copays.
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
  // Health savings account plans are the exception. Federal rules bar them from
  // charging a copay before the deductible is met for anything but preventive
  // care, so on those plans the visits stay in the deductible base and this
  // does nothing.
  let copayApplied = 0;
  let base = allowedCharges;
  if (visits && !plan.hsaEligible && plan.copayBeforeDeductible) {
    const pcp = visits.primaryCareVisits ?? 0;
    const spec = visits.specialistVisits ?? 0;
    if (plan.copayPrimaryCare !== null && pcp > 0) {
      copayApplied += pcp * plan.copayPrimaryCare;
      base -= pcp * ALLOWED_AMOUNTS.primaryCareVisit;
    }
    if (plan.copaySpecialist !== null && spec > 0) {
      copayApplied += spec * plan.copaySpecialist;
      base -= spec * ALLOWED_AMOUNTS.specialistVisit;
    }
    base = Math.max(0, base);
  }

  const deductibleApplied = Math.min(base, deductible);
  const afterDeductible = Math.max(0, base - deductible);
  const coinsuranceApplied = afterDeductible * coinsuranceRate;

  const uncapped = deductibleApplied + coinsuranceApplied + copayApplied;
  const outOfPocket = Math.min(uncapped, moop);

  return {
    deductibleApplied,
    coinsuranceApplied,
    outOfPocket,
    reachesMoop: uncapped >= moop && Number.isFinite(moop),
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
  const allowed = estimatedAllowedCharges(household);
  const sharing = applyCostSharing(plan, allowed, isFamily);

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

  const annualPremiumListed = listMonthly * 12;
  const annualPremiumNet = subsidy
    ? netAnnualPremium(plan, annualPremiumListed, subsidy)
    : annualPremiumListed;
  const federalSubsidyApplied = annualPremiumListed - annualPremiumNet;
  const annualPremiumQuoted =
    quotedMonthlyPremium === null ? null : quotedMonthlyPremium * 12;
  // The agent's quoted figure always wins, because it comes from GetCoveredNJ
  // and carries the state subsidy we cannot yet compute.
  const effectivePremium = annualPremiumQuoted ?? annualPremiumNet;

  const moop =
    (isFamily ? plan.moopFamily : plan.moopIndividual) ?? plan.moopIndividual ?? 0;

  return {
    annualPremiumListed,
    federalSubsidyApplied,
    annualPremiumNet,
    annualPremiumQuoted,
    estimatedAllowedCharges: allowed,
    deductibleApplied: sharing.deductibleApplied,
    coinsuranceApplied: sharing.coinsuranceApplied,
    estimatedOutOfPocket: outOfPocket,
    outOfPocketSource,
    reachesMoop: sharing.reachesMoop,
    estimatedAnnualTotal: effectivePremium + outOfPocket,
    worstCaseAnnualTotal: effectivePremium + moop,
  };
}
