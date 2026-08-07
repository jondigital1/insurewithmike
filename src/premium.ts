/**
 * List premium calculation, kept separate from the cost model so that the
 * subsidy calculation can price the benchmark plan without a circular import.
 */

import { MAX_RATED_CHILDREN, CHILD_RATING_AGE_CEILING } from "./assumptions.ts";
import { rateForAge } from "./dataset.ts";
import type { Household, Plan, PlanDataset } from "./types.ts";

/**
 * Monthly premium for the household at the filed list rate, before subsidy.
 *
 * Marketplace premiums are built by summing each member's age rated premium.
 * New Jersey uses a single statewide rating area, so county does not affect
 * price, only whether the carrier sells there at all. Children beyond the
 * third under age 21 are not charged.
 */
export function monthlyListPremium(
  dataset: PlanDataset,
  plan: Plan,
  household: Household,
): number | null {
  const rates = dataset.rates.get(plan.standardComponentId);
  if (!rates) return null;

  const adults = household.members.filter((m) => m.age > CHILD_RATING_AGE_CEILING);
  const children = household.members
    .filter((m) => m.age <= CHILD_RATING_AGE_CEILING)
    .sort((a, b) => b.age - a.age)
    .slice(0, MAX_RATED_CHILDREN);

  let total = 0;
  for (const member of [...adults, ...children]) {
    const rate = rateForAge(rates, member.age, member.tobaccoUser);
    if (rate === null) return null;
    total += rate;
  }
  return total;
}

