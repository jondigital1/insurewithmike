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
import { coverageTimeline } from "../planyear.ts";
import { checkDrugs, type FormularyIndex } from "../formulary.ts";
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

/**
 * What the client pays for coverage today, which is the figure they judge
 * every option against. The agent page reports each recommended plan as a
 * difference against it rather than as a bare number, because a premium on its
 * own means nothing to anybody.
 *
 * Null for anyone with no coverage, and the page then shows premiums straight
 * rather than comparing them to something invented. Note what this is not: the
 * form does not ask for a monthly ceiling. A client who names one has
 * committed to it before seeing a single plan, and will read anything above it
 * as a failure even when it is the right plan for them.
 */
function monthlyBaseline(answers: Answers): number | null {
  const v = answers.current_premium;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function recommend(
  answers: Answers,
  raw: SerialisedDataset,
  formulary: FormularyIndex | null = null,
) {
  const dataset = hydrate(raw);
  const { household, flags, unsure } = toHousehold(answers);

  // The client names their prescriptions from the bottle. Check them against
  // whatever formulary data we hold, keeping "no data" separate from
  // "not covered".
  const medications = Array.isArray(answers.medications)
    ? (answers.medications as string[])
    : typeof answers.medications === "string"
      ? [answers.medications]
      : [];
  const drugs = checkDrugs(medications.filter(Boolean), formulary);

  const subsidy = computeSubsidy(dataset, household);
  const evaluations = evaluateAllPlans(dataset, household, new Map(), subsidy);
  const shortlist = buildShortlist(evaluations);
  const eligible = evaluations.filter((e) => e.disqualifiers.length === 0);
  // Reported against silver, which is what most households enrol in. The
  // per plan figure varies with metal level and is applied inside the cost
  // model, not here.
  const njhps = njHealthPlanSavings(household, "Silver");

  const excluded = new Map<string, number>();
  for (const e of evaluations) {
    for (const r of e.disqualifiers) excluded.set(r, (excluded.get(r) ?? 0) + 1);
  }

  // A client enrolling outside open enrolment is making two decisions, not
  // one, and the second has its own deadline.
  const startPreference =
    answers.coverage_start === "january"
      ? "january"
      : answers.coverage_start === "unsure"
        ? "unsure"
        : "asap";
  const timeline = coverageTimeline(new Date(), startPreference, [raw.planYear]);

  return {
    household,
    baseline: monthlyBaseline(answers),
    timeline,
    drugs,
    flags: [...flags, ...subsidy.notes, njhps.note],
    unsure,
    subsidy,
    stateSubsidy: njhps,
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

