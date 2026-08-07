/**
 * Turns raw intake answers into the household the engine takes.
 *
 * Deliberately forgiving. A half finished form should still produce a usable
 * picture, because an agent looking at a partial answer set is better off than
 * an agent looking at an error.
 */

import { QUESTIONNAIRE } from "./questionnaire.ts";
import type { CoverageScenario, Household, ServiceCategory, Utilization } from "../types.ts";

export type Answers = Record<string, string | string[] | boolean | undefined>;

/** Resolves a banded answer to its numeric midpoint, defined in the questionnaire. */
function midpoint(questionId: string, value: unknown): number {
  if (typeof value !== "string") return 0;
  for (const section of QUESTIONNAIRE) {
    for (const q of section.questions) {
      if (q.id !== questionId) continue;
      const option = q.options?.find((o) => o.value === value);
      return option?.midpoint ?? (Number(value) || 0);
    }
  }
  return 0;
}

const num = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const list = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []);

/** "cape-may" becomes "Cape May", which is how the filings spell counties. */
export function countyFromSlug(slug: unknown): string {
  if (typeof slug !== "string" || !slug) return "";
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

const HEALTH_SYSTEM_LABELS: Record<string, string> = {
  penn: "Penn Medicine",
  jefferson: "Jefferson Health",
  inspira: "Inspira Health",
  cooper: "Cooper University Health Care",
  virtua: "Virtua Health",
  atlanticare: "AtlantiCare",
  rwjbarnabas: "RWJBarnabas Health",
  hackensack: "Hackensack Meridian Health",
};

/** Which utilisation question feeds which service category. */
const UTILISATION_MAP: Array<[string, ServiceCategory]> = [
  ["visits_primary", "primaryCareVisit"],
  ["visits_specialist", "specialistVisit"],
  ["visits_urgent", "urgentCare"],
  ["visits_er", "emergencyRoom"],
  ["hospital_stays", "inpatientAdmission"],
  ["surgeries", "outpatientSurgery"],
  ["imaging", "advancedImaging"],
  ["therapy", "mentalHealthVisit"],
  ["physical_therapy", "physicalTherapy"],
];

export function utilisationFrom(answers: Answers): Utilization {
  const u: Utilization = {};
  for (const [questionId, category] of UTILISATION_MAP) {
    const n = midpoint(questionId, answers[questionId]);
    if (n > 0) u[category] = n;
  }
  // The form asks whether anyone takes medication regularly and whether any of
  // it is specialty, but not how many. Twelve months is the honest reading of
  // "regularly", and it is flagged to the agent rather than hidden.
  if (answers.takes_medication === "yes") {
    u.genericDrugMonths = 12;
    if (answers.specialty_drug === "yes") u.specialtyDrugMonths = 12;
    else u.preferredBrandDrugMonths = 12;
  }
  return u;
}

/**
 * Picks the standardised coverage example whose shape best matches the client's
 * year, so the engine can use the plan's filed member cost rather than
 * simulating one. Returns undefined when nothing matches closely.
 */
export function scenarioFrom(answers: Answers): CoverageScenario | undefined {
  const planned = list(answers.planned_care);
  const conditions = list(answers.ongoing_conditions);
  if (planned.includes("baby") || answers.pregnancy === "yes") return "havingABaby";
  if (conditions.includes("diabetes")) return "managingDiabetes";
  const er = midpoint("visits_er", answers.visits_er);
  const surgeries = midpoint("surgeries", answers.surgeries);
  if (er >= 1 && surgeries === 0 && conditions.includes("none")) return "simpleFracture";
  return undefined;
}

export interface Conversion {
  household: Household;
  /** Things the agent should know that the engine cannot act on. */
  flags: string[];
  /** Questions the client marked as unsure, which need confirming in the meeting. */
  unsure: string[];
}

export function toHousehold(answers: Answers): Conversion {
  const flags: string[] = [];
  const unsure = Object.keys(answers)
    .filter((k) => k.endsWith("_unsure") && answers[k] === true)
    .map((k) => k.replace(/_unsure$/, "").replace(/_/g, " "));

  const householdSize = Math.max(1, num(answers.household_size) || 1);

  // The form asks the per person block once per household member, so ages
  // arrive as an array in member order. Premium is age rated per person, so a
  // missing age is a wrong price rather than a rounding error, and any that
  // are missing are flagged rather than quietly filled in.
  const ages = list(answers.person_age).map(num);
  const needsCoverage = list(answers.person_needs_coverage);

  const members: Household["members"] = [];
  const missing: number[] = [];
  for (let i = 0; i < householdSize; i += 1) {
    const age = ages[i] ?? 0;
    if (!age) {
      missing.push(i + 1);
      continue;
    }
    members.push({
      age,
      tobaccoUser: false,
      // Utilisation is asked for the household combined, so it sits on the
      // first member. The cost model aggregates across members anyway.
      utilization: i === 0 ? utilisationFrom(answers) : {},
    });
  }

  if (members.length === 0) {
    members.push({ age: 40, tobaccoUser: false, utilization: utilisationFrom(answers) });
    flags.push(
      "No ages were given, so pricing assumes a single 40 year old. Every premium below is wrong until an age is entered.",
    );
  } else if (missing.length) {
    flags.push(
      `No age given for ${missing.length === 1 ? "person" : "people"} ${missing.join(", ")} of ${householdSize}. Those members are not priced, so the premiums below are too low.`,
    );
  }

  const notEnrolling = needsCoverage.filter((v) => v === "no").length;
  if (notEnrolling > 0) {
    flags.push(
      `${notEnrolling} household ${notEnrolling === 1 ? "member is" : "members are"} marked as not needing coverage. They still count toward the poverty level but are priced here, so confirm who is actually enrolling.`,
    );
  }

  if (answers.employer_offer === "yes") {
    flags.push(
      "Employer coverage is available to this household. If it is affordable and meets the minimum value standard they cannot receive the premium tax credit at all, and every net premium below would be wrong.",
    );
  }
  if (answers.tribal_member === "yes") {
    flags.push(
      "Member of a federally recognised tribe. Zero and limited cost sharing plan variants are available, which are richer than anything shown here.",
    );
  }
  if (answers.foster_care === "yes") {
    flags.push("Was in foster care at 18 or older. Check the free coverage pathway to age 26.");
  }
  if (answers.will_file_taxes === "no") {
    flags.push("Does not plan to file a federal return, which forfeits the premium tax credit.");
  }
  if (answers.filing_jointly === "no") {
    flags.push("Married filing separately generally forfeits the credit. Worth confirming.");
  }
  if (answers.income_stability === "varies" || answers.income_stability === "unpredictable") {
    flags.push(
      "Income is not steady. The 400 percent cliff is back for 2026, so a household near the line risks repaying the entire credit at tax time.",
    );
  }
  if (list(answers.time_out_of_state).some((v) => v !== "none")) {
    flags.push(
      "Spends time outside New Jersey. Every plan here is an EPO with no national network, and several cover nothing outside the service area.",
    );
  }
  if (answers.takes_medication === "yes") {
    flags.push(
      "Takes regular medication. Formulary placement cannot be checked from the public plan data, so confirm the drugs are covered before recommending.",
    );
  }
  if (answers.coverage_situation === "losing") {
    flags.push("Losing existing coverage, which opens a special enrolment period.");
  }

  const household: Household = {
    county: countyFromSlug(answers.county),
    annualIncome: num(answers.expected_income),
    householdSize,
    members,
    preferredHealthSystems: list(answers.health_system)
      .filter((v) => v !== "none" && v !== "other")
      .map((v) => HEALTH_SYSTEM_LABELS[v] ?? v),
    perceivedAnnualSpend: num(answers.perceived_spend) || undefined,
    hardshipExemption: false,
    expectedScenario: scenarioFrom(answers),
  };

  return { household, flags, unsure };
}
