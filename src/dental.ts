/**
 * Pricing and reasoning over standalone dental plans.
 *
 * Pure lookups, no filesystem, so this runs unchanged in the browser. puf.ts
 * loads the filings; everything that reasons over them lives here.
 *
 * Dental is a different shape of product from medical and the code should not
 * pretend otherwise. There is no subsidy, no metal level, no network tier, and
 * the filed out of pocket maximum is a few hundred dollars rather than a few
 * thousand, so there is no catastrophic exposure to model. What decides a
 * dental plan is which categories it covers, how often, and what it costs. So
 * this module prices and describes. It does not rank.
 *
 * That is deliberate. Ranking would need dental utilisation from the client,
 * meaning cleanings, crowns and whether a child is heading for braces, and the
 * whole spread across the New Jersey market is roughly $315 a year for a child.
 * A ranking implies a precision the inputs cannot support, and the agent is
 * having that conversation out loud anyway.
 */

import { rateForAge } from "./dataset.ts";
import type { DentalDataset, DentalPlan, Household, HouseholdMember } from "./types.ts";

/** Age at which the pediatric dental essential health benefit stops applying. */
export const PEDIATRIC_DENTAL_MAX_AGE = 18;

export interface DentalQuote {
  plan: DentalPlan;
  /** Monthly premium for everyone this plan can cover in the household. */
  monthlyTotal: number;
  annualTotal: number;
  /** One line per covered member, in household order. */
  perMember: Array<{ age: number; monthly: number }>;
  /**
   * Members this plan cannot cover, by age. A pediatric only plan files no
   * adult rate, so quoting the adults on it would silently price them at zero.
   */
  uncoveredAges: number[];
}

/** Whether a member falls inside the pediatric dental benefit. */
export function isChild(member: HouseholdMember): boolean {
  return member.age <= PEDIATRIC_DENTAL_MAX_AGE;
}

/**
 * Prices one dental plan for one household.
 *
 * Rates are per person by age band, summed. There is no family tier pricing in
 * the New Jersey filings: every tier column is blank on all 2,193 dental rate
 * rows, so summing individual rates is the filed answer rather than an
 * approximation of one. Tobacco is recorded as "No Preference" throughout, so
 * it is not passed through.
 */
export function quoteDentalPlan(
  dataset: DentalDataset,
  plan: DentalPlan,
  members: HouseholdMember[],
): DentalQuote {
  const table = dataset.rates.get(plan.standardComponentId) ?? [];
  const perMember: DentalQuote["perMember"] = [];
  const uncoveredAges: number[] = [];

  for (const member of members) {
    const monthly = rateForAge(table, member.age, false);
    // A zero is how the filings express "this plan does not cover this age",
    // on the pediatric only plans. Treating it as a free adult would be a
    // wrong quote with no error, so it is reported as uncovered instead.
    if (monthly === null || monthly === 0) {
      uncoveredAges.push(member.age);
      continue;
    }
    perMember.push({ age: member.age, monthly });
  }

  const monthlyTotal = perMember.reduce((sum, m) => sum + m.monthly, 0);
  return {
    plan,
    monthlyTotal,
    annualTotal: monthlyTotal * 12,
    perMember,
    uncoveredAges,
  };
}

/**
 * Every dental plan priced for this household, cheapest first.
 *
 * Plans that cannot cover anyone in the household are dropped. Plans that cover
 * some but not all are kept, with the gap named, because a pediatric only plan
 * is often exactly what a family with children wants and hiding it because it
 * will not cover the parents would be unhelpful.
 */
export function quoteAllDental(
  dataset: DentalDataset,
  members: HouseholdMember[],
): DentalQuote[] {
  return dataset.plans
    .map((plan) => quoteDentalPlan(dataset, plan, members))
    .filter((q) => q.perMember.length > 0)
    .sort((a, b) => a.monthlyTotal - b.monthlyTotal);
}

/**
 * The cheapest standalone pediatric dental cover for the children in a
 * household, in dollars for the year. Null when there are no children.
 *
 * This is the floor of what a family has to spend to match a medical plan that
 * already includes children's dental. The cheapest rather than an average on
 * purpose: it is the smallest honest claim about the size of the gap, and it
 * understates rather than overstates the case against the plans that omit it.
 */
export function cheapestPediatricAnnual(
  dataset: DentalDataset,
  household: Household,
): number | null {
  const children = household.members.filter(isChild);
  if (children.length === 0) return null;

  let cheapest: number | null = null;
  for (const plan of dataset.plans) {
    const quote = quoteDentalPlan(dataset, plan, children);
    // Only plans that can cover every child are candidates. A plan covering
    // two of three children is not a substitute for the benefit.
    if (quote.perMember.length !== children.length) continue;
    if (cheapest === null || quote.annualTotal < cheapest) cheapest = quote.annualTotal;
  }
  return cheapest;
}

/**
 * What a household has to add to a medical plan's premium to hold the same
 * cover as a plan that includes children's dental. Zero when the plan already
 * includes it, and zero when there are no children.
 *
 * Scaled by months of coverage for the same reason the medical premium is: a
 * household enrolling in August buys four months of dental, not twelve.
 */
export function pediatricDentalGap(
  dataset: DentalDataset | null,
  household: Household,
  planEmbedsPediatricDental: boolean,
): number {
  if (!dataset || planEmbedsPediatricDental) return 0;
  const annual = cheapestPediatricAnnual(dataset, household);
  if (annual === null) return 0;
  const months = Math.max(1, Math.min(12, household.monthsOfCoverage ?? 12));
  return annual * (months / 12);
}

/**
 * The benefit lines worth putting in front of an agent, in the order they
 * decide a conversation.
 *
 * Orthodontia first because it is the largest sum a family ever spends on
 * dental and the one most often assumed to be covered when it is not. The
 * filed exclusion text is carried through untouched: "Orthodontia require
 * medical necessity" is the whole difference between a plan that pays for a
 * child's braces and one that does not, and no flag we invent survives the
 * next issuer's phrasing.
 */
export const DENTAL_BENEFIT_ORDER = [
  "Orthodontia - Child",
  "Orthodontia - Adult",
  "Dental Check-Up for Children",
  "Routine Dental Services (Adult)",
  "Basic Dental Care - Child",
  "Basic Dental Care - Adult",
  "Major Dental Care - Child",
  "Major Dental Care - Adult",
  "Accidental Dental",
] as const;

export function orderedBenefits(plan: DentalPlan): DentalPlan["benefits"] {
  const byName = new Map(plan.benefits.map((b) => [b.name, b]));
  const ordered = DENTAL_BENEFIT_ORDER.map((name) => byName.get(name)).filter(
    (b): b is DentalPlan["benefits"][number] => b !== undefined,
  );
  // Anything the issuer files that this list does not know about still shows,
  // after the known ones, rather than being silently dropped.
  const known = new Set<string>(DENTAL_BENEFIT_ORDER);
  return [...ordered, ...plan.benefits.filter((b) => !known.has(b.name))];
}
