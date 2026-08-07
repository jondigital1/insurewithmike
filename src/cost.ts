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
export function applyCostSharing(
  plan: Plan,
  allowedCharges: number,
  isFamily: boolean,
): CostSharingResult {
  const deductible =
    (isFamily ? plan.deductibleFamily : plan.deductibleIndividual) ??
    plan.deductibleIndividual ??
    0;
  const moop =
    (isFamily ? plan.moopFamily : plan.moopIndividual) ?? plan.moopIndividual ?? Infinity;
  const coinsuranceRate = plan.coinsurance ?? 0;

  const deductibleApplied = Math.min(allowedCharges, deductible);
  const afterDeductible = Math.max(0, allowedCharges - deductible);
  const coinsuranceApplied = afterDeductible * coinsuranceRate;

  const uncapped = deductibleApplied + coinsuranceApplied;
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
    estimatedOutOfPocket: sharing.outOfPocket,
    reachesMoop: sharing.reachesMoop,
    estimatedAnnualTotal: effectivePremium + sharing.outOfPocket,
    worstCaseAnnualTotal: effectivePremium + moop,
  };
}
