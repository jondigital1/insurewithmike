/**
 * Browser entry point for the agent facing recommendation.
 *
 * The same engine modules run here as run in Node. The only difference is
 * where the plan data comes from: Node parses the CSV filings, the browser
 * hydrates a JSON bundle emitted from those same filings at build time. There
 * is no second implementation to drift.
 */

import { allowedChargesByCategory } from "../cost.ts";
import { toHousehold, type Answers } from "../intake/toHousehold.ts";
import { buildShortlist, evaluateAllPlans, eligibleSilverVariant } from "../rank.ts";
import { computeSubsidy, njHealthPlanSavings } from "../subsidy.ts";
import { CATEGORY_LABELS, federalPovertyLevel, fplPercentage } from "../assumptions.ts";
import type { PlanDataset, RateRow } from "../types.ts";

interface SerialisedDataset {
  planYear: number;
  plans: PlanDataset["plans"];
  rates: Record<string, RateRow[]>;
  serviceAreas: PlanDataset["serviceAreas"];
}

function hydrate(raw: SerialisedDataset): PlanDataset {
  return {
    planYear: raw.planYear,
    plans: raw.plans,
    rates: new Map(Object.entries(raw.rates)),
    serviceAreas: raw.serviceAreas,
    benefits: new Map(),
  };
}

export function recommend(answers: Answers, raw: SerialisedDataset) {
  const dataset = hydrate(raw);
  const { household, flags, unsure } = toHousehold(answers);

  const subsidy = computeSubsidy(dataset, household);
  const evaluations = evaluateAllPlans(dataset, household, new Map(), subsidy);
  const shortlist = buildShortlist(evaluations);
  const eligible = evaluations.filter((e) => e.disqualifiers.length === 0);
  const njhps = njHealthPlanSavings(household);

  const excluded = new Map<string, number>();
  for (const e of evaluations) {
    for (const r of e.disqualifiers) excluded.set(r, (excluded.get(r) ?? 0) + 1);
  }

  return {
    household,
    flags: [...flags, ...subsidy.notes, njhps.note],
    unsure,
    subsidy,
    silverVariant: eligibleSilverVariant(household),
    fplPercentage: fplPercentage(household.annualIncome, household.householdSize),
    federalPovertyLevel: federalPovertyLevel(household.householdSize),
    shortlist,
    allEligible: eligible.sort(
      (a, b) => a.cost.estimatedAnnualTotal - b.cost.estimatedAnnualTotal,
    ),
    evaluatedCount: evaluations.length,
    eligibleCount: eligible.length,
    excluded: [...excluded.entries()].sort((a, b) => b[1] - a[1]),
    utilisation: allowedChargesByCategory(household).map((c) => ({
      label: CATEGORY_LABELS[c.category],
      units: c.units,
      allowed: c.allowed,
    })),
  };
}

declare global {
  interface Window {
    AskMike: { recommend: typeof recommend };
  }
}

window.AskMike = { recommend };
