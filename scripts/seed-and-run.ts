/**
 * Builds a set of synthetic households chosen to exercise the awkward paths,
 * runs every one through the engine, and stores the submissions, the runs and
 * the shortlists.
 *
 * These are invented people. Nothing here is real client data.
 *
 * Usage: npx tsx scripts/seed-and-run.ts [dbfile]
 */

import { rmSync, existsSync } from "node:fs";
import { loadPlanDataset, issuerCounties } from "../src/puf.ts";
import { evaluateAllPlans, buildShortlist, eligibleSilverVariant } from "../src/rank.ts";
import { computeSubsidy } from "../src/subsidy.ts";
import { fplPercentage } from "../src/assumptions.ts";
import { Store } from "../src/store/db.ts";
import { currentVersions } from "../src/store/versions.ts";
import type { Household } from "../src/types.ts";

const DATA_DIR = "data/nj-sbe-puf-2026";
const DB_FILE = process.argv[2] ?? "data/testing.sqlite";

if (existsSync(DB_FILE)) rmSync(DB_FILE, { force: true });
for (const suffix of ["-wal", "-shm"]) {
  if (existsSync(DB_FILE + suffix)) rmSync(DB_FILE + suffix, { force: true });
}

const dataset = loadPlanDataset(DATA_DIR, 2026);
const versions = currentVersions(DATA_DIR);
const store = new Store({ file: DB_FILE });
const agencyId = store.ensureAgency("kachur-nj", "Kachur Agency, New Jersey");

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Counties Ambetter does not sell in, used for the availability case below. */
const ambetterCounties = issuerCounties(dataset, "17970");
const allCounties = new Set(dataset.serviceAreas.map((a) => a.countyName).filter(Boolean));
const ambetterGaps = [...allCounties].filter((c) => !ambetterCounties.has(c)).sort();

interface Persona {
  name: string;
  why: string;
  household: Household;
}

const adult = (age: number, utilization: Household["members"][number]["utilization"] = {}) => ({
  age,
  tobaccoUser: false,
  utilization,
});

const PERSONAS: Persona[] = [
  {
    name: "Gloucester family of four, moderate use",
    why: "The ordinary case. Everything else is measured against this one.",
    household: {
      county: "Gloucester",
      annualIncome: 96000,
      householdSize: 4,
      preferredHealthSystems: ["Jefferson", "Inspira"],
      perceivedAnnualSpend: 4000,
      members: [
        adult(44, { primaryCareVisit: 3, specialistVisit: 2, labWork: 4, preferredBrandDrugMonths: 12 }),
        adult(42, { primaryCareVisit: 2, specialistVisit: 1, labWork: 2, genericDrugMonths: 12 }),
        adult(14, { primaryCareVisit: 2, mentalHealthVisit: 20, urgentCare: 1 }),
        adult(9, { primaryCareVisit: 2, urgentCare: 1 }),
      ],
    },
  },
  {
    name: "Single 27, barely uses care, 140 percent of poverty",
    why: "Should land on the 94 percent silver variant. Tests that the engine does not send a low income client to bronze on premium alone.",
    household: {
      county: "Camden",
      annualIncome: 21900,
      householdSize: 1,
      preferredHealthSystems: [],
      members: [adult(27, { primaryCareVisit: 1 })],
    },
  },
  {
    name: "Single 27, same person at 180 percent",
    why: "Same client, more income. Should move to the 87 percent variant and a materially worse deal.",
    household: {
      county: "Camden",
      annualIncome: 28200,
      householdSize: 1,
      preferredHealthSystems: [],
      members: [adult(27, { primaryCareVisit: 1 })],
    },
  },
  {
    name: "Couple aged 60, just under the cliff",
    why: "399 percent of poverty. Large subsidy, and one raise away from losing all of it.",
    household: {
      county: "Monmouth",
      annualIncome: 84600,
      householdSize: 2,
      preferredHealthSystems: ["Hackensack"],
      members: [
        adult(60, { primaryCareVisit: 3, specialistVisit: 4, labWork: 6, preferredBrandDrugMonths: 12 }),
        adult(61, { primaryCareVisit: 2, specialistVisit: 2, labWork: 4 }),
      ],
    },
  },
  {
    name: "Same couple, just over the cliff",
    why: "401 percent. Nothing at all. The single most brutal transition in the whole system.",
    household: {
      county: "Monmouth",
      annualIncome: 85100,
      householdSize: 2,
      preferredHealthSystems: ["Hackensack"],
      members: [
        adult(60, { primaryCareVisit: 3, specialistVisit: 4, labWork: 6, preferredBrandDrugMonths: 12 }),
        adult(61, { primaryCareVisit: 2, specialistVisit: 2, labWork: 4 }),
      ],
    },
  },
  {
    name: "Diabetic 55, heavy prescription use",
    why: "The condition where the filed cost examples run from $400 to $5,420 and invert the premium ranking.",
    household: {
      county: "Burlington",
      annualIncome: 52000,
      householdSize: 1,
      preferredHealthSystems: ["Virtua"],
      members: [
        adult(55, {
          primaryCareVisit: 4,
          specialistVisit: 6,
          labWork: 12,
          preferredBrandDrugMonths: 12,
          genericDrugMonths: 12,
        }),
      ],
    },
  },
  {
    name: "Two 26 year olds, no dependants",
    why: "The only household in this set actually eligible for catastrophic coverage.",
    household: {
      county: "Hudson",
      annualIncome: 62000,
      householdSize: 2,
      preferredHealthSystems: [],
      members: [adult(26, { primaryCareVisit: 1 }), adult(26, {})],
    },
  },
  {
    name: "Pregnant 31, first baby",
    why: "The largest predictable cost event there is, and every plan files a standard example for it.",
    household: {
      county: "Essex",
      annualIncome: 47000,
      householdSize: 2,
      preferredHealthSystems: ["RWJBarnabas"],
      members: [
        adult(31, { primaryCareVisit: 8, specialistVisit: 10, labWork: 14, advancedImaging: 3 }),
        adult(33, { primaryCareVisit: 1 }),
      ],
    },
  },
  {
    name: "Ongoing physical therapy, 48",
    why: "Runs into the 30 visit annual cap that every plan files explicitly.",
    household: {
      county: "Morris",
      annualIncome: 71000,
      householdSize: 1,
      preferredHealthSystems: ["Hackensack"],
      members: [adult(48, { physicalTherapy: 40, specialistVisit: 4, advancedImaging: 2, outpatientSurgery: 1 })],
    },
  },
  {
    name: "Catastrophic year, 58",
    why: "Hospital admission and surgery. Should reach the out of pocket maximum on every plan, which is the case where worst case ranking is the only thing that matters.",
    household: {
      county: "Ocean",
      annualIncome: 58000,
      householdSize: 1,
      preferredHealthSystems: ["AtlantiCare"],
      members: [
        adult(58, {
          inpatientAdmission: 1,
          outpatientSurgery: 2,
          specialistVisit: 12,
          advancedImaging: 4,
          labWork: 20,
          specialtyDrugMonths: 6,
        }),
      ],
    },
  },
  {
    name: `Family in ${ambetterGaps[0] ?? "Salem"} County`,
    why: "A county Ambetter does not sell in, so the engine must drop those plans on availability rather than price.",
    household: {
      county: ambetterGaps[0] ?? "Salem",
      annualIncome: 68000,
      householdSize: 3,
      preferredHealthSystems: ["Inspira"],
      members: [adult(38, { primaryCareVisit: 2 }), adult(36, { primaryCareVisit: 2 }), adult(4, { primaryCareVisit: 4 })],
    },
  },
  {
    name: "Retired couple, 63 and 64, low income",
    why: "The oldest and most expensive age band, on the richest cost sharing available.",
    household: {
      county: "Cape May",
      annualIncome: 32000,
      householdSize: 2,
      preferredHealthSystems: ["AtlantiCare"],
      members: [
        adult(63, { primaryCareVisit: 4, specialistVisit: 5, labWork: 8, genericDrugMonths: 12 }),
        adult(64, { primaryCareVisit: 4, specialistVisit: 3, labWork: 6, preferredBrandDrugMonths: 12 }),
      ],
    },
  },
];

function flagsFor(h: Household): string[] {
  const flags: string[] = [];
  const pct = fplPercentage(h.annualIncome, h.householdSize);
  if (pct < 138) flags.push("Below the NJ FamilyCare threshold, check Medicaid eligibility before quoting");
  if (pct > 350 && pct <= 400) flags.push("Within 50 points of the 400 percent cliff, confirm projected income");
  if (pct > 400) flags.push("Over the 400 percent cliff, no federal premium tax credit for 2026");
  if (h.preferredHealthSystems.length > 0)
    flags.push(`Network not verified against ${h.preferredHealthSystems.join(", ")}`);
  if (h.members.some((m) => (m.utilization.physicalTherapy ?? 0) > 30))
    flags.push("Physical therapy use exceeds the 30 visit annual cap filed by every plan");
  if (h.members.some((m) => (m.utilization.specialtyDrugMonths ?? 0) > 0))
    flags.push("Specialty drug use, formulary placement not yet checkable from the public data");
  return flags;
}

console.log("=".repeat(96));
console.log(`SEEDING SYNTHETIC TEST DATA into ${DB_FILE}`);
console.log("=".repeat(96));
console.log(`\nengine ${versions.engine}   plan data ${versions.planData}   assumptions ${versions.assumptions}`);
console.log(`Ambetter does not sell in: ${ambetterGaps.join(", ") || "(none)"}\n`);

console.log(
  `${"HOUSEHOLD".padEnd(46)} ${"FPL".padStart(6)} ${"CSR".padStart(9)} ${"SUBSIDY".padStart(9)} ${"ELIG".padStart(5)} ${"TOP PICK".padEnd(34)} ${"TOTAL".padStart(9)}`,
);
console.log("-".repeat(96));

for (const persona of PERSONAS) {
  const code = store.issueClientCode(agencyId, persona.name);
  const submissionId = store.recordSubmission({
    agencyId,
    clientCode: code,
    answers: persona.household,
    questionnaireVersion: versions.questionnaire,
    isSynthetic: true,
    notes: persona.why,
  });

  const subsidy = computeSubsidy(dataset, persona.household);
  const evaluations = evaluateAllPlans(dataset, persona.household, new Map(), subsidy);
  const shortlist = buildShortlist(evaluations);
  const variant = eligibleSilverVariant(persona.household);

  store.recordRun({
    submissionId,
    agencyId,
    planYear: 2026,
    versions,
    household: persona.household,
    subsidy,
    evaluations,
    shortlist,
    silverVariant: variant,
    flags: flagsFor(persona.household),
  });

  const top = shortlist[0];
  const pct = fplPercentage(persona.household.annualIncome, persona.household.householdSize);
  const eligible = evaluations.filter((e) => e.disqualifiers.length === 0).length;

  console.log(
    `${persona.name.slice(0, 45).padEnd(46)} ${`${pct.toFixed(0)}%`.padStart(6)} ${variant.padStart(9)} ${usd(subsidy.federalAnnualSubsidy).padStart(9)} ${String(eligible).padStart(5)} ${(top ? `${top.evaluation.plan.issuerName.split(" ")[0]} ${top.evaluation.plan.marketingName}` : "none").slice(0, 33).padEnd(34)} ${top ? usd(top.evaluation.cost.estimatedAnnualTotal).padStart(9) : "".padStart(9)}`,
  );
}

console.log("\n" + "-".repeat(96));
const counts = store.query<{ n: number }>(`SELECT COUNT(*) AS n FROM submission`)[0];
const runs = store.query<{ n: number }>(`SELECT COUNT(*) AS n FROM recommendation_run`)[0];
const picks = store.query<{ n: number }>(`SELECT COUNT(*) AS n FROM shortlist_entry`)[0];
console.log(
  `Stored ${counts?.n ?? 0} submissions, ${runs?.n ?? 0} recommendation runs, ${picks?.n ?? 0} shortlist entries.`,
);
console.log(
  "\nNothing has been reviewed by an agent yet. Once Mike marks these up, agent_review is what",
);
console.log("turns this from a record into a measurement.");

store.close();

