/**
 * Which intake questions earn their place?
 *
 * The 49 questions were reasoned into existence, the same way the engine was,
 * and neither has been checked against reality. Length is not free: every
 * question is a chance for the client to give up, and a client who abandons
 * the form is worth less than one who answers a shorter version honestly.
 *
 * Two tests, in order of how damning they are.
 *
 * REACH. Change one answer, hold everything else, and see whether the household
 * the engine receives changes at all. A question whose answer cannot reach the
 * engine cannot possibly change the recommendation. Some of those are still
 * worth keeping, because they raise a flag the agent acts on, so reach is
 * measured separately against the household and against the flags.
 *
 * EFFECT. For questions that do reach the engine, sweep the answer across its
 * full range on every base household and see whether the shortlist moves. A
 * question that can swing from its lowest to its highest answer without ever
 * changing the top pick, or moving the money much, is decoration.
 *
 * What this cannot tell you: whether a question is needed for the government
 * application, or whether the agent uses it in conversation. Those are Mike's
 * to answer. This narrows the list he has to consider.
 *
 * Usage: npx tsx scripts/question-value.ts [--verbose]
 */

import { allQuestions } from "../src/intake/questionnaire.ts";
import { toHousehold, type Answers } from "../src/intake/toHousehold.ts";
import { loadPlanDataset } from "../src/puf.ts";
import { computeSubsidy } from "../src/subsidy.ts";
import { evaluateAllPlans, buildShortlist } from "../src/rank.ts";

const VERBOSE = process.argv.includes("--verbose");
const dataset = loadPlanDataset("data/nj-sbe-puf-2026", 2026);

// A fixed date so the months-of-coverage answer does not drift with the wall
// clock and make a rerun disagree with the run it is being compared against.
const TODAY = new Date("2026-08-10T12:00:00Z");

// ---------------------------------------------------------------- base cases

/**
 * Six households spanning the axes that actually move a recommendation: age,
 * household size, income relative to the poverty level, and how much care they
 * use. A question that never matters across all six is a strong cut candidate.
 */
const BASES: Array<{ name: string; answers: Answers }> = [
  {
    name: "single 27, light, 250% FPL",
    answers: {
      coverage_situation: "new", coverage_start: "january", county: "camden",
      household_size: "1", person_age: ["27"], person_relationship: ["self"],
      person_needs_coverage: ["yes"], tax_filing: "single",
      employment_status: ["employed"], wages: ["39000"], expected_income: "39000",
      income_stability: "steady", pregnancy: "no", tribal_member: "no", foster_care: "no",
      health_system: ["none"], network_priority: "flexible",
      visits_primary: "1-2", visits_specialist: "0", visits_urgent: "0", visits_er: "0",
      hospital_stays: "0", surgeries: "0", imaging: "0", therapy: "0", physical_therapy: "0",
      medications: [], ongoing_conditions: ["none"], planned_care: ["none"],
      time_out_of_state: ["none"], risk_appetite: "low_premium", perceived_spend: "600",
    },
  },
  {
    name: "single 55, moderate, 180% FPL",
    answers: {
      coverage_situation: "renewing", coverage_start: "january", county: "atlantic",
      household_size: "1", person_age: ["55"], person_relationship: ["self"],
      person_needs_coverage: ["yes"], tax_filing: "single",
      employment_status: ["employed"], wages: ["28000"], expected_income: "28000",
      income_stability: "steady", pregnancy: "no", tribal_member: "no", foster_care: "no",
      current_insurer: "horizon", current_insurer_feeling: "neutral",
      health_system: ["inspira"], network_priority: "prefer",
      visits_primary: "3-5", visits_specialist: "3-5", visits_urgent: "1", visits_er: "0",
      hospital_stays: "0", surgeries: "0", imaging: "1", therapy: "0", physical_therapy: "0",
      medications: ["atorvastatin"], specialty_drug: "no",
      ongoing_conditions: ["heart"], planned_care: ["none"],
      time_out_of_state: ["none"], risk_appetite: "balanced", perceived_spend: "2400",
    },
  },
  {
    name: "couple 60/58, heavy, 350% FPL",
    answers: {
      coverage_situation: "renewing", coverage_start: "january", county: "gloucester",
      household_size: "2", person_age: ["60", "58"], person_relationship: ["self", "spouse"],
      person_needs_coverage: ["yes", "yes"], tax_filing: "joint",
      employment_status: ["self", "employed"], self_employment_net: ["40000"], wages: ["", "35000"],
      expected_income: "75000", income_stability: "varies",
      pregnancy: "no", tribal_member: "no", foster_care: "no",
      current_insurer: "amerihealth", current_insurer_feeling: "leave",
      health_system: ["cooper", "jefferson"], network_priority: "must",
      visits_primary: "6-10", visits_specialist: "11-20", visits_urgent: "1", visits_er: "1",
      hospital_stays: "1", surgeries: "1", imaging: "2-3", therapy: "0", physical_therapy: "6-10",
      medications: ["metformin", "insulin glargine"], specialty_drug: "yes",
      ongoing_conditions: ["diabetes"], planned_care: ["surgery"],
      time_out_of_state: ["snowbird"], risk_appetite: "low_risk", perceived_spend: "9000",
    },
  },
  {
    name: "family of four, moderate, 300% FPL",
    answers: {
      coverage_situation: "new", coverage_start: "january", county: "burlington",
      household_size: "4", person_age: ["40", "38", "10", "7"],
      person_relationship: ["self", "spouse", "child", "child"],
      person_needs_coverage: ["yes", "yes", "yes", "yes"], tax_filing: "joint",
      employment_status: ["employed", "employed"], wages: ["60000", "36000"],
      expected_income: "96000", income_stability: "steady",
      pregnancy: "no", tribal_member: "no", foster_care: "no",
      health_system: ["virtua"], network_priority: "prefer",
      visits_primary: "6-10", visits_specialist: "3-5", visits_urgent: "2-3", visits_er: "0",
      hospital_stays: "0", surgeries: "0", imaging: "1", therapy: "1-2", physical_therapy: "0",
      medications: ["albuterol"], specialty_drug: "no",
      ongoing_conditions: ["asthma"], planned_care: ["none"],
      time_out_of_state: ["none"], risk_appetite: "balanced", perceived_spend: "4000",
    },
  },
  {
    name: "family of four, light, 450% FPL",
    answers: {
      coverage_situation: "new", coverage_start: "january", county: "monmouth",
      household_size: "4", person_age: ["42", "41", "14", "9"],
      person_relationship: ["self", "spouse", "child", "child"],
      person_needs_coverage: ["yes", "yes", "yes", "yes"], tax_filing: "joint",
      employment_status: ["employed", "employed"], wages: ["95000", "50000"],
      expected_income: "145000", income_stability: "steady",
      pregnancy: "no", tribal_member: "no", foster_care: "no",
      health_system: ["hackensack"], network_priority: "prefer",
      visits_primary: "3-5", visits_specialist: "1-2", visits_urgent: "1", visits_er: "0",
      hospital_stays: "0", surgeries: "0", imaging: "0", therapy: "0", physical_therapy: "0",
      medications: [], ongoing_conditions: ["none"], planned_care: ["none"],
      time_out_of_state: ["none"], risk_appetite: "low_premium", perceived_spend: "1500",
    },
  },
  {
    // Exists so the conditional questions have their gate open somewhere. A
    // question only shown after a life event looks dead if no base household
    // ever has one, which says nothing about the question.
    name: "single 31, job loss, employer offer",
    answers: {
      coverage_situation: "losing", coverage_start: "asap", county: "union",
      household_size: "1", person_age: ["31"], person_relationship: ["self"],
      person_needs_coverage: ["yes"], tax_filing: "single",
      life_changes: ["lost_coverage", "job_change"], life_change_when: "within60",
      employment_status: ["none"], wages: ["0"], other_income_amount: "14000",
      expected_income: "14000", income_stability: "unpredictable",
      employer_offer: "yes", employer_offer_cost: "480",
      pregnancy: "no", tribal_member: "no", foster_care: "no",
      current_insurer: "oscar", current_insurer_feeling: "keep",
      current_plan_name: "Oscar Silver Simple", current_premium: "410",
      health_system: ["none"], network_priority: "none",
      visits_primary: "1-2", visits_specialist: "1-2", visits_urgent: "1", visits_er: "0",
      hospital_stays: "0", surgeries: "0", imaging: "0", therapy: "3-5", physical_therapy: "0",
      medications: ["sertraline"], specialty_drug: "no",
      ongoing_conditions: ["mental_health"], planned_care: ["none"],
      time_out_of_state: ["none"], risk_appetite: "balanced", perceived_spend: "1800",
    },
  },
  {
    name: "single 34 pregnant, 200% FPL",
    answers: {
      coverage_situation: "losing", coverage_start: "asap", county: "essex",
      household_size: "1", person_age: ["34"], person_relationship: ["self"],
      person_needs_coverage: ["yes"], tax_filing: "single",
      employment_status: ["employed"], wages: ["31000"], expected_income: "31000",
      income_stability: "steady", pregnancy: "yes", pregnancy_due: "q2",
      tribal_member: "no", foster_care: "no",
      health_system: ["rwjbarnabas"], network_priority: "prefer",
      visits_primary: "3-5", visits_specialist: "6-10", visits_urgent: "0", visits_er: "0",
      hospital_stays: "1", surgeries: "0", imaging: "1-2", therapy: "0", physical_therapy: "0",
      medications: [], ongoing_conditions: ["none"], planned_care: ["baby"],
      time_out_of_state: ["none"], risk_appetite: "low_risk", perceived_spend: "3000",
    },
  },
];

// ------------------------------------------------------------------- helpers

interface Outcome {
  top: string;
  shortlist: string[];
  topTotal: number;
}

/**
 * The income boxes do not reach the engine directly. The form adds them up in
 * the browser, shows the total back for confirmation, and only that total is
 * read by the converter. Mutating a wage box without recomputing the total
 * would therefore make every income question look inert, which is an artifact
 * of the test rather than a fact about the question. This mirrors the sum in
 * web/index.html so the income half is measured on the path it actually takes.
 */
function deriveIncome(answers: Answers): Answers {
  const nums = (v: unknown): number[] =>
    (Array.isArray(v) ? v : [v]).map((x) => Number(String(x ?? "").replace(/[$,\s]/g, "")) || 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const total = Math.max(
    0,
    sum(nums(answers.wages)) +
      sum(nums(answers.self_employment_net)) +
      sum(nums(answers.other_income_amount)) -
      sum(nums(answers.deductions_amount)),
  );
  return { ...answers, expected_income: String(total) };
}

function outcomeFor(raw: Answers): Outcome | null {
  const answers = deriveIncome(raw);
  const { household } = toHousehold(answers, TODAY);
  const subsidy = computeSubsidy(dataset, household);
  const evals = evaluateAllPlans(dataset, household, new Map(), subsidy);
  const short = buildShortlist(evals);
  if (!short.length) return null;
  return {
    top: short[0]!.evaluation.plan.planId,
    shortlist: short.map((s) => s.evaluation.plan.planId),
    topTotal: short[0]!.evaluation.cost.estimatedAnnualTotal,
  };
}

function flagsFor(raw: Answers): string {
  return toHousehold(deriveIncome(raw), TODAY).flags.join(" ");
}

function householdFor(raw: Answers): string {
  return JSON.stringify(toHousehold(deriveIncome(raw), TODAY).household);
}

/**
 * The alternative answers to try for a question. Choice questions sweep every
 * option; free text and numbers get plausible extremes rather than nonsense,
 * because the point is whether a realistic client answering differently gets a
 * different recommendation.
 */
function alternatives(q: ReturnType<typeof allQuestions>[number], current: unknown): unknown[] {
  const out: unknown[] = [];
  if (q.options?.length) {
    for (const o of q.options) out.push(q.kind === "multichoice" ? [o.value] : o.value);
  } else if (q.kind === "currency" || q.kind === "number" || q.kind === "estimate") {
    out.push("0", "1000", "25000", "60000", "150000");
  } else if (q.kind === "boolean") {
    out.push("yes", "no");
  } else if (q.kind === "drugs") {
    out.push([], ["metformin"], ["adalimumab"]);
  } else if (q.kind === "text" || q.kind === "longtext" || q.kind === "repeater") {
    out.push("", "Dr Smith", "something the client typed");
  }
  // perPerson questions arrive as arrays, so wrap scalars to match the shape
  // the converter expects rather than handing it a string it will not read.
  if (q.perPerson) {
    return out.map((v) => (Array.isArray(v) ? v : [v, v, v, v]));
  }
  return out.filter((v) => JSON.stringify(v) !== JSON.stringify(current));
}

// -------------------------------------------------------- part one, reach

const questions = allQuestions();

interface Reach {
  id: string;
  half: string;
  routing: string;
  section: string;
  movesHousehold: boolean;
  movesFlags: boolean;
}

const reaches: Reach[] = [];

for (const q of questions) {
  let movesHousehold = false;
  let movesFlags = false;
  for (const base of BASES) {
    const baseHh = householdFor(base.answers);
    const baseFlags = flagsFor(base.answers);
    for (const alt of alternatives(q, base.answers[q.id])) {
      const mutated: Answers = { ...base.answers, [q.id]: alt as Answers[string] };
      if (householdFor(mutated) !== baseHh) movesHousehold = true;
      if (flagsFor(mutated) !== baseFlags) movesFlags = true;
      if (movesHousehold && movesFlags) break;
    }
    if (movesHousehold && movesFlags) break;
  }
  reaches.push({
    id: q.id, half: q.half, routing: q.routing, section: q.section,
    movesHousehold, movesFlags,
  });
}

console.log("REACH: can this question's answer touch anything at all?");
console.log("=".repeat(76));

// Derived rather than asked: the form works these out from other boxes and
// shows them back. They cannot be cut and they cannot be measured on their own,
// because the converter reads the derived total and never the question.
const DERIVED = new Set(["expected_income"]);

const dead = reaches.filter((r) => !r.movesHousehold && !r.movesFlags && !DERIVED.has(r.id));
const flagOnly = reaches.filter((r) => !r.movesHousehold && r.movesFlags);
const live = reaches.filter((r) => r.movesHousehold);

console.log(`\n  reaches the engine        ${live.length}`);
console.log(`  raises a flag only        ${flagOnly.length}`);
console.log(`  touches nothing           ${dead.length}`);

console.log(`\n\nTOUCHES NOTHING. Changing the answer changes no output at all.`);
console.log(`These are either dead weight or they exist for the government`);
console.log(`application, which this test cannot see.\n`);
for (const r of dead) {
  console.log(`  ${r.id.padEnd(26)} ${r.routing.padEnd(7)} ${r.half.padEnd(12)} ${r.section}`);
}

console.log(`\n\nFLAG ONLY. Changes what the agent is told, never the ranking.`);
console.log(`Keep if the agent acts on it, cut if they do not. Mike decides.\n`);
for (const r of flagOnly) {
  console.log(`  ${r.id.padEnd(26)} ${r.routing.padEnd(7)} ${r.half.padEnd(12)} ${r.section}`);
}

const mislabelled = reaches.filter(
  (r) => r.routing === "intake" && !r.movesHousehold && !DERIVED.has(r.id),
);
if (mislabelled.length) {
  console.log(`\n\nMISLABELLED. Tagged "intake", meaning it feeds the recommendation,`);
  console.log(`but nothing it says reaches the household.\n`);
  for (const r of mislabelled) console.log(`  ${r.id}`);
}

// ------------------------------------------------------- part two, effect

console.log(`\n\n`);
console.log("EFFECT: for questions that do reach the engine, does the answer move it?");
console.log("=".repeat(76));
console.log(`\nEach answer swept across its full range on all ${BASES.length} households.\n`);

interface Effect {
  id: string;
  half: string;
  section: string;
  topFlips: number;
  trials: number;
  shortlistChanges: number;
  maxSwing: number;
}

const effects: Effect[] = [];

for (const r of live) {
  const q = questions.find((x) => x.id === r.id)!;
  let topFlips = 0, trials = 0, shortlistChanges = 0, maxSwing = 0;

  for (const base of BASES) {
    const baseOut = outcomeFor(base.answers);
    if (!baseOut) continue;
    for (const alt of alternatives(q, base.answers[q.id])) {
      const mutated: Answers = { ...base.answers, [q.id]: alt as Answers[string] };
      const got = outcomeFor(mutated);
      if (!got) continue;
      trials += 1;
      if (got.top !== baseOut.top) topFlips += 1;
      if (got.shortlist.join() !== baseOut.shortlist.join()) shortlistChanges += 1;
      maxSwing = Math.max(maxSwing, Math.abs(got.topTotal - baseOut.topTotal));
    }
  }
  effects.push({
    id: r.id, half: r.half, section: r.section,
    topFlips, trials, shortlistChanges, maxSwing,
  });
}

effects.sort((a, b) => b.topFlips - a.topFlips || b.maxSwing - a.maxSwing);

console.log(`  ${"QUESTION".padEnd(26)} ${"FLIPS".padStart(9)} ${"LIST".padStart(7)} ${"MAX $ SWING".padStart(12)}  SECTION`);
for (const e of effects) {
  const flips = `${e.topFlips}/${e.trials}`;
  console.log(
    `  ${e.id.padEnd(26)} ${flips.padStart(9)} ${String(e.shortlistChanges).padStart(7)} ` +
      `${("$" + Math.round(e.maxSwing).toLocaleString("en-US")).padStart(12)}  ${e.section}`,
  );
}

/**
 * Measured as inert here, but only because this script scores the ranking and
 * nothing else. Both feed the staying-put option in rank.ts, which is a real
 * output on a path the outcome function does not read. Listed so the number is
 * not mistaken for a verdict.
 */
const SCORED_ELSEWHERE = new Set(["current_insurer", "current_insurer_feeling"]);

const inert = effects.filter(
  (e) => e.topFlips === 0 && e.shortlistChanges === 0 && !SCORED_ELSEWHERE.has(e.id),
);
console.log(`\n\nINERT. Reaches the engine, but sweeping the whole answer range never`);
console.log(`changed the top pick or the shortlist on any of the ${BASES.length} households.\n`);
for (const e of inert) {
  console.log(`  ${e.id.padEnd(26)} max swing $${Math.round(e.maxSwing).toLocaleString("en-US")}`);
}

console.log(`\n\nNOT SCORED HERE. Feeds the staying-put option rather than the ranking,`);
console.log(`which this script does not read. Absence of effect above is not a verdict.\n`);
for (const e of effects.filter((x) => SCORED_ELSEWHERE.has(x.id))) {
  console.log(`  ${e.id}`);
}

// ------------------------------------------------------------------ verdict

console.log(`\n\nCUT LIST, in order of confidence`);
console.log("=".repeat(76));
console.log(`\n  1. Touches nothing      ${dead.length} questions`);
console.log(`  2. Inert in the engine  ${inert.length} questions`);
console.log(`  3. Flag only            ${flagOnly.length} questions, ask Mike whether he acts on each`);
const cuttable = dead.length + inert.length;
console.log(
  `\n  Questions surviving on measured value alone: ${questions.length - cuttable - flagOnly.length} of ${questions.length}.`,
);
console.log(
  `\n  Caveat that matters: "inert" is inert ACROSS THESE ${BASES.length} HOUSEHOLDS. A question\n` +
    `  that only bites on a household shape not in the list will look inert here and\n` +
    `  is not. Read the max swing column before cutting anything: a question that\n` +
    `  moves real money without reordering the shortlist is measuring something, and\n` +
    `  will start reordering it as soon as the cost model gets copays.`,
);

if (VERBOSE) {
  console.log(`\n\nBASE HOUSEHOLD OUTCOMES\n`);
  for (const b of BASES) {
    const o = outcomeFor(b.answers);
    console.log(`  ${b.name.padEnd(34)} ${o ? o.top : "no shortlist"}  $${o ? Math.round(o.topTotal).toLocaleString("en-US") : "-"}`);
  }
}
