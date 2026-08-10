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

/**
 * Whether anyone is on regular medication, read off the list rather than off a
 * separate yes or no. Naming a drug says yes; leaving the list blank says no.
 */
export function takesMedication(answers: Answers): boolean {
  return list(answers.medications).some((m) => typeof m === "string" && m.trim() !== "");
}

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
  // The form asks for the list itself rather than a yes or no, and whether any
  // of it is specialty, but not how many. Twelve months is the honest reading
  // of "regularly", and it is flagged to the agent rather than hidden.
  if (takesMedication(answers)) {
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

/**
 * Months of coverage left in the plan year.
 *
 * Coverage generally starts on the first of the month after enrolment, so
 * someone signing up in August is buying four months, not twelve. The premium
 * and the amount of care both scale with that; the deductible and out of
 * pocket maximum do not.
 */
export function monthsOfCoverageFrom(answers: Answers, today = new Date()): number {
  if (answers.coverage_start === "january") return 12;
  const startMonthIndex = today.getMonth() + 1; // first of next month, 0 indexed
  const remaining = 12 - startMonthIndex;
  return Math.max(1, Math.min(12, remaining));
}

export function toHousehold(answers: Answers, today = new Date()): Conversion {
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
  if (answers.tax_filing === "none") {
    flags.push("Does not plan to file a federal return, which forfeits the premium tax credit.");
  }
  if (answers.tax_filing === "separate") {
    flags.push(
      "Married filing separately, which generally forfeits the credit entirely. There are narrow exceptions for abuse and abandonment. Worth confirming before quoting an unsubsidised premium.",
    );
  }
  // The client is shown the total the form worked out and asked to confirm it.
  // A correction is not a problem, but a large one means the boxes and the
  // client disagree about what the household earns, and the subsidy runs on
  // whichever is right.
  if (answers.expected_income_corrected === "yes") {
    const typed = num(answers.expected_income);
    const computed = num(answers.expected_income_estimated);
    if (computed > 0 && typed > 0) {
      const gap = Math.abs(typed - computed);
      if (gap / computed >= 0.15) {
        flags.push(
          `Client corrected the income estimate from $${Math.round(computed).toLocaleString("en-US")} to $${Math.round(typed).toLocaleString("en-US")}. Their figure is the one used here. Worth asking what the boxes missed.`,
        );
      }
    }
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
  if (takesMedication(answers)) {
    flags.push(
      "Takes regular medication. Formulary placement cannot be checked from the public plan data, so confirm the drugs are covered before recommending.",
    );
  }

  // Dental and vision interest changes what the agent brings to the meeting,
  // never what the engine computes. The vision message splits by household
  // shape because the facts split: children have eye exams and glasses on
  // every marketplace plan, adults on none, and no standalone vision plan is
  // filed in New Jersey at all.
  const extras = list(answers.dental_vision_interest);
  if (extras.includes("dental")) {
    flags.push(
      "Asked about dental. The Dental view in the header is already priced for this household from the ages given.",
    );
  }
  if (extras.includes("vision")) {
    flags.push(
      members.some((m) => m.age <= 18)
        ? "Asked about vision. The children already have eye exams and glasses on every plan here, whichever one is picked. Adult vision is on none of them and nothing standalone is filed in New Jersey, so that half is an off-marketplace conversation."
        : "Asked about vision. No plan here covers adult vision and nothing standalone is filed in New Jersey, so this is an off-marketplace conversation.",
    );
  }
  if (answers.coverage_situation === "losing") {
    flags.push("Losing existing coverage, which opens a special enrolment period.");
  }

  // The one network answer that changes how the meeting starts. The tool
  // holds no provider directory, so a client who will not change doctors is
  // a sale decided by facts the tool does not have.
  if (answers.network_priority === "must") {
    flags.push(
      "Will not change doctors. Network fit decides this sale and the tool cannot verify networks, so check the named doctors against each shortlisted plan's directory before quoting.",
    );
  }

  // Life events. Outside open enrolment one of these is the only route to
  // coverage at all, and the window is short, so this is stated first and
  // plainly rather than left for the agent to infer.
  const events = list(answers.life_changes).filter((v) => v !== "none");
  if (events.length) {
    const LABELS: Record<string, string> = {
      lost_coverage: "lost coverage",
      job_change: "job loss or change",
      married: "marriage",
      divorced: "divorce or legal separation",
      baby: "birth, adoption or foster placement",
      moved: "change of address",
      aged_off: "aged off a parent's plan at 26",
      death: "death in the household",
      income_change: "significant income change",
      status_change: "new citizenship or immigration status",
      released: "release from incarceration",
    };
    const named = events.map((e) => LABELS[e] ?? e).join(", ");
    const when = answers.life_change_when;

    if (when === "over60") {
      flags.push(
        `Life event reported (${named}) but more than 60 days ago. The special enrolment window has probably closed, so check before promising coverage can start now.`,
      );
    } else if (when === "within60" || when === "upcoming") {
      flags.push(
        `Life event reported (${named}), ${when === "upcoming" ? "not yet happened" : "within the last 60 days"}. This is what opens a special enrolment period, so confirm the date and the proof required.`,
      );
    } else {
      flags.push(
        `Life event reported (${named}) with no date given. The date decides whether they can enrol at all outside open enrolment.`,
      );
    }

    if (events.includes("married") || events.includes("divorced")) {
      flags.push(
        "Marriage or divorce changes the tax household, which moves both the premium tax credit and the cost sharing tier. The income and household answers here may already be out of date.",
      );
    }
    if (events.includes("job_change") || events.includes("income_change")) {
      flags.push(
        "Income has changed, so last year's figure is the wrong basis. The projected income on this form is what the credit is calculated on and what gets reconciled at tax time.",
      );
    }
    if (events.includes("baby")) {
      flags.push(
        "New child in the household. Coverage can usually be backdated to the date of birth or placement.",
      );
    }
    if (events.includes("moved")) {
      flags.push(
        "Change of address. Confirm the county. New Jersey is one rating area so the list price of a plan is the same everywhere, but county decides which carriers can sell to them, and that changes the benchmark silver plan the federal credit is calculated from. A move can therefore change what they actually pay without any plan changing its price.",
      );
    }
    if (events.includes("lost_coverage")) {
      flags.push(
        "Check how the coverage ended. Losing it counts as a qualifying event, but voluntarily dropping a plan, or losing it for non payment, does not. Clients rarely distinguish the two when they describe it.",
      );
    }
  }

  const months = monthsOfCoverageFrom(answers, today);
  if (months < 12) {
    flags.push(
      `Coverage starts with ${months} month${months === 1 ? "" : "s"} left in the plan year. Premium and expected care are scaled to that, but the deductible and out of pocket maximum are not, because they reset annually whoever joins and whenever. High deductible plans are a worse deal on a short year than the annual figures suggest.`,
    );
  }
  if (answers.coverage_start === "unsure") {
    flags.push(
      "Start date not decided. Figures assume the earliest possible start; a January start changes which plan wins, not just the totals.",
    );
  }

  // Married filing separately generally forfeits the credit outright. There is
  // a narrow exception for domestic abuse and spousal abandonment, and someone
  // who has just separated is exactly who might qualify for it.
  if (answers.tax_filing === "separate" && events.includes("divorced")) {
    flags.push(
      "Separating and not filing jointly. That normally forfeits the premium tax credit entirely, but there is an exception for domestic abuse and spousal abandonment which is worth raising carefully.",
    );
  }

  // The questionnaire lists Aetna because it left the New Jersey market for
  // 2026. Anyone still on it is moving carriers whether they want to or not,
  // and the conversation goes better when the agent opens with that.
  if (answers.current_insurer === "aetna") {
    flags.push(
      "Currently with Aetna, which left the New Jersey individual market for 2026. There is no staying put: every option is a carrier change, so lead with that rather than letting them discover it.",
    );
  }

  // Aversion is a hard constraint more often than a preference, and the
  // reason behind it decides the meeting: bad claims handling argues for a
  // carrier change, one bad billing episode might not. The form deliberately
  // does not ask why. That conversation belongs to the agent.
  if (
    answers.current_insurer_feeling === "leave" &&
    typeof answers.current_insurer === "string" &&
    !["other", "aetna"].includes(answers.current_insurer)
  ) {
    flags.push(
      "They want out of their current carrier. Open by asking what went wrong: a claims or network problem argues for the move, a one-off billing fight might not justify losing a better-priced plan. Their carrier's plans still appear in the ranking on purpose, priced, so the cost of the aversion is a number rather than a guess.",
    );
  }

  const household: Household = {
    county: countyFromSlug(answers.county),
    annualIncome: num(answers.expected_income),
    householdSize,
    members,
    preferredHealthSystems: list(answers.health_system)
      .filter((v) => v !== "none" && v !== "other")
      .map((v) => HEALTH_SYSTEM_LABELS[v] ?? v),
    primaryCareDoctor:
      typeof answers.primary_care_doctor === "string" && answers.primary_care_doctor.trim()
        ? answers.primary_care_doctor.trim()
        : undefined,
    specialists: list(answers.specialists).filter(Boolean),
    networkPriority: (["must", "prefer", "flexible", "none"] as const).find(
      (v) => v === answers.network_priority,
    ),
    switchSavingsThreshold: num(answers.network_price) || undefined,
    perceivedAnnualSpend: num(answers.perceived_spend) || undefined,
    hardshipExemption: false,
    expectedScenario: scenarioFrom(answers),
    monthsOfCoverage: months,
    // "other" carries no information and Aetna left the market for 2026, so
    // neither can anchor a staying-put option. The Aetna case already gets its
    // own flag: that client is moving whether they like it or not.
    currentInsurer:
      typeof answers.current_insurer === "string" &&
      !["other", "aetna"].includes(answers.current_insurer)
        ? answers.current_insurer
        : undefined,
    // Guarded on the carrier being one we can act on, not just on the feeling
    // being present. A browser keeps hidden answers around, so someone who
    // picked a carrier, said they hated it, then went back and switched to
    // "not sure" would otherwise submit a feeling about nobody, and the agent
    // would get a "wants out" flag with no carrier to want out of.
    currentInsurerFeeling:
      typeof answers.current_insurer === "string" &&
      !["other", "aetna"].includes(answers.current_insurer) &&
      (answers.current_insurer_feeling === "keep" ||
        answers.current_insurer_feeling === "neutral" ||
        answers.current_insurer_feeling === "leave")
        ? answers.current_insurer_feeling
        : undefined,
  };

  return { household, flags, unsure };
}

