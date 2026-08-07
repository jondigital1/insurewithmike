/**
 * Premium subsidy calculation for the 2026 coverage year.
 *
 * IMPORTANT CONTEXT: the enhanced premium tax credits created by the American
 * Rescue Plan and extended by the Inflation Reduction Act expired on
 * 31 December 2025. For 2026 the original statutory rules are back, which
 * means the applicable percentages are higher and the hard cutoff at 400
 * percent of the federal poverty level has returned. A household one dollar
 * over 400 percent receives nothing.
 *
 * Applicable percentages are from IRS Rev. Proc. 2025-25.
 */

import { fplPercentage } from "./assumptions.ts";
import { monthlyListPremium } from "./premium.ts";
import { issuerCounties } from "./puf.ts";
import type { Household, Plan, PlanDataset } from "./types.ts";

interface PercentageBand {
  /** Lower bound of the band as a percentage of the federal poverty level. */
  from: number;
  to: number;
  /** Applicable percentage at the lower bound. */
  startPct: number;
  /** Applicable percentage at the upper bound. Equal to startPct when flat. */
  endPct: number;
}

/** IRS Rev. Proc. 2025-25, applicable percentage table for taxable year 2026. */
const APPLICABLE_PERCENTAGE_2026: PercentageBand[] = [
  { from: 0, to: 133, startPct: 2.1, endPct: 2.1 },
  { from: 133, to: 150, startPct: 3.14, endPct: 4.19 },
  { from: 150, to: 200, startPct: 4.19, endPct: 6.6 },
  { from: 200, to: 250, startPct: 6.6, endPct: 8.44 },
  { from: 250, to: 300, startPct: 8.44, endPct: 9.96 },
  { from: 300, to: 400, startPct: 9.96, endPct: 9.96 },
];

export const PTC_INCOME_CEILING_PCT = 400;

/**
 * The share of income a household is expected to contribute toward the
 * benchmark plan, interpolated linearly within each band as the statute
 * requires. Returns null above 400 percent, where no credit is available.
 */
export function applicablePercentage(fplPct: number): number | null {
  if (fplPct > PTC_INCOME_CEILING_PCT) return null;
  for (const band of APPLICABLE_PERCENTAGE_2026) {
    if (fplPct >= band.from && fplPct <= band.to) {
      if (band.startPct === band.endPct) return band.startPct / 100;
      const progress = (fplPct - band.from) / (band.to - band.from);
      return (band.startPct + (band.endPct - band.startPct) * progress) / 100;
    }
  }
  return null;
}

/** Plans a household can actually buy, used to find the benchmark. */
function availableSilverBasePlans(dataset: PlanDataset, household: Household): Plan[] {
  return dataset.plans.filter((p) => {
    if (p.metalLevel !== "Silver") return false;
    if (p.csrVariant !== "standard") return false;
    const counties = issuerCounties(dataset, p.issuerId);
    return counties.size === 0 || counties.has(household.county);
  });
}

export interface SubsidyResult {
  fplPercentage: number;
  applicablePercentage: number | null;
  /** Annual amount the household is expected to pay toward the benchmark. */
  expectedAnnualContribution: number | null;
  /** The second lowest cost silver plan available to them. */
  benchmarkPlan: Plan | null;
  benchmarkAnnualPremium: number | null;
  /** Annual advance premium tax credit, dollars. Zero when ineligible. */
  federalAnnualSubsidy: number;
  /** Set when the household is over the cliff and receives nothing. */
  overSubsidyCliff: boolean;
  notes: string[];
}

/**
 * Computes the federal advance premium tax credit.
 *
 * The credit is a fixed dollar amount, set by the benchmark plan and the
 * household's income, and it can be applied to any metal level except
 * catastrophic. It is capped at the premium of whichever plan is chosen, so a
 * household never receives more credit than their plan costs.
 */
export function computeSubsidy(
  dataset: PlanDataset,
  household: Household,
): SubsidyResult {
  const fplPct = fplPercentage(household.annualIncome, household.householdSize);
  const notes: string[] = [];

  const silver = availableSilverBasePlans(dataset, household);
  const priced = silver
    .map((plan) => ({ plan, monthly: monthlyListPremium(dataset, plan, household) }))
    .filter((x): x is { plan: Plan; monthly: number } => x.monthly !== null)
    .sort((a, b) => a.monthly - b.monthly);

  const benchmark = priced[1] ?? priced[0] ?? null;
  if (priced.length < 2 && benchmark) {
    notes.push(
      "Fewer than two silver plans available, using the lowest cost silver as the benchmark",
    );
  }

  const appPct = applicablePercentage(fplPct);
  if (appPct === null) {
    notes.push(
      `Household is at ${fplPct.toFixed(0)} percent of the federal poverty level, above the 400 percent cutoff. No federal premium tax credit for 2026.`,
    );
    return {
      fplPercentage: fplPct,
      applicablePercentage: null,
      expectedAnnualContribution: null,
      benchmarkPlan: benchmark?.plan ?? null,
      benchmarkAnnualPremium: benchmark ? benchmark.monthly * 12 : null,
      federalAnnualSubsidy: 0,
      overSubsidyCliff: true,
      notes,
    };
  }

  const expectedContribution = household.annualIncome * appPct;
  const benchmarkAnnual = benchmark ? benchmark.monthly * 12 : null;
  const subsidy =
    benchmarkAnnual === null ? 0 : Math.max(0, benchmarkAnnual - expectedContribution);

  if (fplPct < 100) {
    notes.push(
      "Household income is below the federal poverty level. Check NJ FamilyCare eligibility before quoting marketplace coverage.",
    );
  }
  if (fplPct > 350 && fplPct <= 400) {
    notes.push(
      "Household is close to the 400 percent cliff. A modest income increase would eliminate the entire credit, so confirm projected income carefully.",
    );
  }

  return {
    fplPercentage: fplPct,
    applicablePercentage: appPct,
    expectedAnnualContribution: expectedContribution,
    benchmarkPlan: benchmark?.plan ?? null,
    benchmarkAnnualPremium: benchmarkAnnual,
    federalAnnualSubsidy: subsidy,
    overSubsidyCliff: false,
    notes,
  };
}

/**
 * Applies the credit to a specific plan's annual premium.
 *
 * Catastrophic plans are statutorily excluded from the premium tax credit,
 * which is why they frequently look cheapest on paper and are the wrong answer
 * for any subsidised household.
 */
export function netAnnualPremium(
  plan: Plan,
  listAnnualPremium: number,
  subsidy: SubsidyResult,
): number {
  if (plan.metalLevel === "Catastrophic") return listAnnualPremium;
  return Math.max(0, listAnnualPremium - subsidy.federalAnnualSubsidy);
}

/**
 * New Jersey Health Plan Savings, the state subsidy that stacks on top of the
 * federal credit and reaches up to 600 percent of the federal poverty level.
 *
 * NOT YET IMPLEMENTED. The state publishes fixed per member monthly amounts by
 * income band rather than a formula, and those amounts are not present in any
 * dataset we hold. Until the schedule is obtained from GetCoveredNJ or DOBI,
 * this returns zero and the agent's quoted premium remains the source of truth
 * for households under 600 percent of the poverty level.
 */
export function njHealthPlanSavings(household: Household): {
  amount: number;
  implemented: boolean;
  note: string;
} {
  const fplPct = fplPercentage(household.annualIncome, household.householdSize);
  const eligible = fplPct <= 600;
  return {
    amount: 0,
    implemented: false,
    note: eligible
      ? `Household at ${fplPct.toFixed(0)} percent of the poverty level likely qualifies for NJ Health Plan Savings, which is not yet modelled. The agent's quoted premium will be lower than the figure shown here.`
      : `Household at ${fplPct.toFixed(0)} percent of the poverty level is above the 600 percent NJ Health Plan Savings ceiling.`,
  };
}
