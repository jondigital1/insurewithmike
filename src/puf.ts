/**
 * Loader for the CMS State-Based Exchange QHP Public Use Files, New Jersey.
 *
 * The files arrive as CSV exported from SERFF filings. Column names contain
 * spaces, money is formatted for humans, and several columns carry filing
 * typos that are reproduced faithfully here rather than corrected upstream.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import type {
  BenefitRow,
  CoverageExample,
  CsrVariant,
  DentalDataset,
  DentalPlan,
  MetalLevel,
  Plan,
  PlanDataset,
  RateRow,
  ServiceArea,
} from "./types.ts";
import { rateForAge } from "./dataset.ts";

type Row = Record<string, string>;

/**
 * Issuer names are not populated in the New Jersey plan file. These are the
 * five carriers offering individual medical coverage on GetCoveredNJ for
 * 2026, keyed by HIOS issuer id and corroborated by the network and service
 * area names in the same dataset.
 */
const ISSUER_NAMES: Record<string, string> = {
  "17970": "Ambetter from WellCare of New Jersey",
  "23818": "Oscar New Jersey",
  "37777": "UnitedHealthcare / Oxford",
  "91661": "Horizon Blue Cross Blue Shield of New Jersey",
  "91762": "AmeriHealth New Jersey",

  // Dental-only issuers. Horizon and UnitedHealthcare sell both and are named
  // above. These three are identified from the network and service area names
  // in the same filings: "Dentegra PPO Individual", "DentalGuard Preferred"
  // and "GLIC Individual PPO" for Guardian Life, and "Delta Dental PPO".
  "48608": "Dentegra Insurance Company",
  "93627": "Guardian Life",
  "99708": "Delta Dental",
  // 35152 sells "Choice PPO" and "Select Plan" and is not named anywhere in
  // the filings, so it falls through to the issuer id rather than a guess. Its
  // marketing names are what an agent recognises anyway.
};

const CSR_VARIANTS: Record<string, CsrVariant> = {
  "Standard Silver On Exchange Plan": "standard",
  "Standard Gold On Exchange Plan": "standard",
  "Standard Bronze On Exchange Plan": "standard",
  "Standard Catastrophic On Exchange Plan": "standard",
  "Standard Platinum On Exchange Plan": "standard",
  "73% AV Level Silver Plan": "csr73",
  "87% AV Level Silver Plan": "csr87",
  "94% AV Level Silver Plan": "csr94",
  "Zero Cost Sharing Plan Variation": "zeroCostSharing",
  "Limited Cost Sharing Plan Variation": "limitedCostSharing",
};

function readCsv(dir: string, filePrefix: string): Row[] {
  const match = readdirSync(dir).find(
    (f) => f.startsWith(filePrefix) && f.toLowerCase().endsWith(".csv"),
  );
  if (!match) {
    throw new Error(`No CSV starting with "${filePrefix}" found in ${dir}`);
  }
  const text = readFileSync(join(dir, match), "utf8");
  return parse(text, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Row[];
}

/** Parses "$2,500 ", "$0", "Not Applicable" and "" into a number or null. */
function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || /^not\s*applicable$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Family limits are filed as a single string carrying both figures, for
 * example "$9800 per person | $19600 per group". Returns the per group figure,
 * which is the one that caps a whole household.
 */
function familyPerGroup(raw: string | undefined): number | null {
  if (!raw) return null;
  const perGroup = raw.split("|").find((part) => /per group/i.test(part));
  if (!perGroup) return money(raw);
  return money(perGroup.replace(/per group/i, ""));
}

/** Parses "50.00%" into 0.5. Returns null for blanks and "Not Applicable". */
function percent(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[%\s]/g, "");
  if (cleaned === "" || /^notapplicable$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n / 100 : null;
}

function yesNo(raw: string | undefined): boolean {
  return /^(yes|true)$/i.test((raw ?? "").trim());
}

/** Prefers the total essential health benefit column, falls back to medical. */
function preferTotal(
  row: Row,
  totalKey: string,
  medicalKey: string,
  parser: (raw: string | undefined) => number | null,
): number | null {
  return parser(row[totalKey]) ?? parser(row[medicalKey]);
}

/**
 * Reads one standardised coverage example. Returns null only when the issuer
 * filed nothing at all, which in the 2026 New Jersey data never happens.
 */
function coverageExample(
  row: Row,
  dedKey: string,
  copayKey: string,
  coinsKey: string,
  limitKey: string,
): CoverageExample | null {
  const deductible = money(row[dedKey]);
  const copayment = money(row[copayKey]);
  const coinsurance = money(row[coinsKey]);
  const limits = money(row[limitKey]);
  if (deductible === null && copayment === null && coinsurance === null) return null;
  const parts = [deductible ?? 0, copayment ?? 0, coinsurance ?? 0, limits ?? 0];
  return {
    deductible: parts[0]!,
    copayment: parts[1]!,
    coinsurance: parts[2]!,
    limits: parts[3]!,
    total: parts.reduce((a, b) => a + b, 0),
  };
}

/**
 * Pulls the office visit copay pair out of a plan's marketing name.
 *
 * The New Jersey filings carry no copay columns at all, but some issuers put
 * them in the plan name: "IHC Silver EPO AmeriHealth Advantage $25/$60" means
 * $25 to see a primary care doctor and $60 to see a specialist. It is the only
 * copay data in the dataset, so it is worth taking.
 *
 * The convention is primary first, specialist second, and it holds across
 * every plan named this way. Anything that does not match the pattern returns
 * nulls rather than a guess.
 */
export function copaysFromName(marketingName: string): {
  primary: number | null;
  specialist: number | null;
} {
  const m = marketingName.match(/\$(\d{1,3})\s*\/\s*\$(\d{1,3})\b/);
  if (!m) return { primary: null, specialist: null };
  const primary = Number(m[1]);
  const specialist = Number(m[2]);
  // A specialist visit never costs less than a primary care visit. If the pair
  // reads the other way round it is not a copay pair, so take neither.
  if (!Number.isFinite(primary) || !Number.isFinite(specialist) || specialist < primary) {
    return { primary: null, specialist: null };
  }
  return { primary, specialist };
}

function loadPlans(dir: string): Plan[] {
  return readCsv(dir, "NJPlans")
    .filter((r) => r["DENTAL ONLY PLAN"] === "No")
    .map((r): Plan => {
      const issuerId = r["ISSUER ID"] ?? "";
      const copays = copaysFromName(r["PLAN MARKETING NAME"] ?? "");
      return {
        planId: r["PLAN ID"] ?? "",
        standardComponentId: r["STANDARD COMPONENT ID"] ?? "",
        issuerId,
        issuerName: ISSUER_NAMES[issuerId] ?? `Issuer ${issuerId}`,
        marketingName: r["PLAN MARKETING NAME"] ?? "",
        metalLevel: (r["METAL LEVEL"] ?? "") as MetalLevel,
        planType: r["PLAN TYPE"] ?? "",
        csrVariant: CSR_VARIANTS[r["CSR VARIATION TYPE"] ?? ""] ?? "standard",
        networkId: r["NETWORK ID"] ?? "",
        formularyId: r["FORMULARY ID"] ?? "",
        serviceAreaId: r["SERVICE AREA ID"] ?? "",
        hsaEligible: yesNo(r["IS HSA ELIGIBLE"]),
        actuarialValue: percent(r["ISSUER ACTUARIAL VALUE"]),
        // Set from the benefits file once it is loaded, in applyPediatricDental.
        embedsPediatricDental: false,

        deductibleIndividual: preferTotal(
          r,
          "TEHB DED INN TIER 1 INDIVIDUAL",
          "MEHB DED INN TIER1 INDIVIDUAL",
          money,
        ),
        deductibleFamily: preferTotal(
          r,
          "TEHB DED INN TIER 1 FAMILY",
          "MEHB DED INN TIER1 FAMILY",
          familyPerGroup,
        ),
        // "COINSURNACE" is a typo in the filed medical column name. It is
        // reproduced here because that is the actual header in the file.
        coinsurance: preferTotal(
          r,
          "TEHB DED INN TIER 1 COINSURANCE",
          "MEHB DED INN TIER1 COINSURNACE",
          percent,
        ),
        moopIndividual: preferTotal(
          r,
          "TEHB INN TIER 1 INDIVIDUAL MOOP",
          "MEHB INN TIER 1 INDIVIDUAL MOOP",
          money,
        ),
        moopFamily: preferTotal(
          r,
          "TEHB INN TIER 1 FAMILY MOOP",
          "MEHB INN TIER 1 FAMILY MOOP",
          familyPerGroup,
        ),

        coverageExamples: {
          havingABaby: coverageExample(
            r,
            "SBC HAVING A BABY DEDUCTIBLE",
            "SBC HAVING A BABY COPAYMENT",
            "SBC HAVING A BABY COINSURANCE",
            "SBC HAVING A BABY LIMIT",
          ),
          // The double space in the diabetes copayment header is a typo in the
          // filed data. Reproduced rather than corrected.
          managingDiabetes: coverageExample(
            r,
            "SBC HAVING DIABETES DEDUCTIBLE",
            "SBC HAVING  DIABETES COPAYMENT",
            "SBC HAVING DIABETES COINSURANCE",
            "SBC HAVING DIABETES LIMIT",
          ),
          simpleFracture: coverageExample(
            r,
            "SBC HAVING SIMPLE FRACTURE DEDUCTIBLE",
            "SBC HAVING SIMPLE FRACTURE COPAYMENT",
            "SBC HAVING SIMPLE FRACTURE COINSURANCE",
            "SBC HAVING SIMPLE FRACTURE LIMIT",
          ),
        },

        copayPrimaryCare: copays.primary,
        copaySpecialist: copays.specialist,
        copayBeforeDeductible: copays.primary !== null && !yesNo(r["IS HSA ELIGIBLE"]),
        // Set by applyCopayIndex when a benefit schedule was actually read.
        // A copay recovered from the plan's marketing name is not a schedule.
        copaysRead: false,
        copaysCoinsuredInstead: false,

        hasSecondNetworkTier: yesNo(r["MULTIPLE NETWORK TIERS"]),
        deductibleIndividualTier2: preferTotal(
          r,
          "TEHB DED INN TIER 2 INDIVIDUAL",
          "MEHB DED INN TIER2 INDIVIDUAL",
          money,
        ),
        moopIndividualTier2: preferTotal(
          r,
          "TEHB INN TIER 2 INDIVIDUAL MOOP",
          "MEHB INN TIER 2 INDIVIDUAL MOOP",
          money,
        ),
      };
    });
}

/**
 * Rates are filed against the 14 character standard component id rather than
 * the variant level plan id, because every cost sharing variant of a plan is
 * sold at the same premium.
 */
function loadRates(dir: string): Map<string, RateRow[]> {
  const byPlan = new Map<string, RateRow[]>();
  for (const r of readCsv(dir, "NJRates")) {
    const planId = r["PLAN ID"] ?? "";
    const individualRate = money(r["INDIVIDUAL RATE"]);
    if (!planId || individualRate === null) continue;
    const row: RateRow = {
      planId,
      age: (r["AGE"] ?? "").trim(),
      ratingArea: (r["RATING AREA ID"] ?? "").trim(),
      individualRate,
      individualTobaccoRate: money(r["INDIVIDUAL TOBACCO RATE"]),
    };
    const existing = byPlan.get(planId);
    if (existing) existing.push(row);
    else byPlan.set(planId, [row]);
  }
  assertOneRatePerAge(byPlan);
  return byPlan;
}

/**
 * Refuses to load a rate file this engine cannot price correctly.
 *
 * The 2026 New Jersey file declares six rating areas, and it is tempting to
 * read that as six prices. It is not: every medical plan is filed in Rating
 * Area 1 alone, and the only plans reaching areas 2 to 6 are three Horizon
 * dental products that are filtered out before ranking and carry identical
 * rates in every area anyway. So there is exactly one rate per age and
 * geography does not enter the premium.
 *
 * Nothing in this file guarantees that stays true. Rates are keyed on plan id
 * with no rating area in the key, so a plan filed at genuinely different
 * prices per area would leave several rows for the same age and rateForAge
 * would take whichever came first. That is a wrong premium with no error,
 * which is the worst failure this codebase can have, and it is precisely what
 * would happen the first time this engine is pointed at a state where rating
 * areas mean something.
 *
 * Hence a hard failure rather than a warning. If we cannot tell which rate
 * applies, guessing is not an option worth having.
 */
function assertOneRatePerAge(byPlan: Map<string, RateRow[]>): void {
  const conflicts: string[] = [];
  for (const [planId, rows] of byPlan) {
    const seen = new Map<string, RateRow>();
    for (const row of rows) {
      const key = `${row.age}|${row.individualTobaccoRate === null ? "n" : "t"}`;
      const first = seen.get(key);
      if (!first) {
        seen.set(key, row);
        continue;
      }
      if (first.individualRate !== row.individualRate) {
        conflicts.push(
          `${planId} age ${row.age}: ${first.ratingArea} $${first.individualRate} vs ` +
            `${row.ratingArea} $${row.individualRate}`,
        );
      }
    }
  }
  if (conflicts.length) {
    throw new Error(
      `Rates differ by rating area, which this engine cannot yet price.\n` +
        `It keys rates on plan id alone, so it has no way to pick the row for a\n` +
        `household's area and would silently use whichever was read first.\n` +
        `Teach premium.ts about rating areas before loading this file.\n\n` +
        conflicts.slice(0, 10).map((c) => `  ${c}`).join("\n") +
        (conflicts.length > 10 ? `\n  ... and ${conflicts.length - 10} more` : ""),
    );
  }
}

function loadServiceAreas(dir: string, dentalOnly: boolean): ServiceArea[] {
  return readCsv(dir, "NJServiceAreas")
    .filter((r) => r["DENTAL PLAN ONLY"] === (dentalOnly ? "Yes" : "No"))
    .map((r) => ({
      serviceAreaId: r["SERVICE AREA ID"] ?? "",
      issuerId: r["ISSUER ID"] ?? "",
      countyName: (r["COUNTY NAME"] ?? "").trim(),
      coversEntireState: yesNo(r["COVER ENTIRE STATE"]),
    }))
    .filter((a) => a.countyName !== "" || a.coversEntireState);
}

function loadBenefits(dir: string): Map<string, BenefitRow[]> {
  const byPlan = new Map<string, BenefitRow[]>();
  for (const r of readCsv(dir, "NJBenefits")) {
    const planId = r["PLAN ID"] ?? "";
    if (!planId) continue;
    const row: BenefitRow = {
      planId,
      standardComponentId: r["STANDARD COMPONENT ID"] ?? "",
      benefitName: r["BENEFIT NAME"] ?? "",
      isCovered: yesNo(r["IS COVERED"]),
      isEhb: yesNo(r["IS EHB"]),
      isStateMandate: yesNo(r["IS STATE MANDATE"]),
      subjectToDeductibleTier1: r["IS SUBJECTED TO DED TIER 1"]
        ? yesNo(r["IS SUBJECTED TO DED TIER 1"])
        : null,
      excludedFromInnMoop: r["IS EXCLUDED FROM INN MOOP"]
        ? yesNo(r["IS EXCLUDED FROM INN MOOP"])
        : null,
      quantityLimit: r["LIMIT QUANTITY"] || null,
      quantityLimitUnit: r["LIMIT UNIT"] || null,
      exclusions: r["EXCLUSIONS"] || null,
    };
    const existing = byPlan.get(planId);
    if (existing) existing.push(row);
    else byPlan.set(planId, [row]);
  }
  return byPlan;
}

/**
 * The benefit line that decides whether a medical plan covers children's dental.
 *
 * The filings carry three child dental lines, check-up, basic and major, and on
 * every New Jersey plan they move together: a plan covering one covers all
 * three. The check-up is used as the discriminator because it is the one a
 * family notices first, and it is the one the issuer summaries name.
 *
 * Verified against Horizon's own Summary of Benefits for OMNIA Silver Value
 * 2026, which prints "Children's dental check-up: Not Covered" while listing
 * children's eye exam and glasses as covered. The filings and the published
 * summary agree, which is why this reads a single column rather than guessing
 * from the pediatric dental apportionment quantity, a field New Jersey leaves
 * blank on all 176 medical plans.
 */
const CHILD_DENTAL_BENEFIT = "Dental Check-Up for Children";

/**
 * Marks the medical plans whose own benefit schedule covers children's dental.
 *
 * Applied here, alongside the copay overlay, so that every consumer of a plan
 * object sees the same answer. A household with a child on a plan that is not
 * marked has to buy standalone dental, and the cost model has to say so or its
 * totals compare unlike things.
 */
function applyPediatricDental(plans: Plan[], benefits: Map<string, BenefitRow[]>): void {
  for (const plan of plans) {
    const rows = benefits.get(plan.planId) ?? [];
    plan.embedsPediatricDental = rows.some(
      (b) => b.benefitName === CHILD_DENTAL_BENEFIT && b.isCovered,
    );
  }
}

/**
 * Loads the standalone dental plans, which loadPlans deliberately excludes.
 *
 * These are filed in the same files as the medical plans and are rated
 * identically: one individual rate per age band, tobacco recorded as "No
 * Preference" throughout, every family tier column blank, and the three plans
 * filed in more than one rating area carrying the same price in all six. So
 * pricing a household is the sum of one lookup per member, exactly as it is on
 * the medical side, and loadRates already holds their rate tables because it
 * never filtered them out.
 */
export function loadDentalDataset(dir: string, planYear: number): DentalDataset {
  const benefits = loadBenefits(dir);
  const rates = loadRates(dir);

  const plans: DentalPlan[] = readCsv(dir, "NJPlans")
    .filter((r) => r["DENTAL ONLY PLAN"] === "Yes")
    .map((r): DentalPlan => {
      const planId = r["PLAN ID"] ?? "";
      const issuerId = r["ISSUER ID"] ?? "";
      const rows = benefits.get(planId) ?? [];
      // A plan filing no adult rate covers children only. Read off the rate
      // table rather than the name, because "Horizon Young Grins" says nothing
      // a machine can rely on and the Delta pediatric plans are named for the
      // benefit rather than the age.
      const table = rates.get(r["STANDARD COMPONENT ID"] ?? "") ?? [];
      const adult = rateForAge(table, 40, false);
      return {
        planId,
        standardComponentId: r["STANDARD COMPONENT ID"] ?? "",
        issuerId,
        issuerName: ISSUER_NAMES[issuerId] ?? `Issuer ${issuerId}`,
        marketingName: (r["PLAN MARKETING NAME"] ?? "").trim(),
        planType: r["PLAN TYPE"] ?? "",
        serviceAreaId: r["SERVICE AREA ID"] ?? "",
        deductibleIndividual: preferTotal(
          r,
          "TEHB DED INN TIER 1 INDIVIDUAL",
          "MEHB DED INN TIER1 INDIVIDUAL",
          money,
        ),
        deductibleFamily: preferTotal(
          r,
          "TEHB DED INN TIER 1 FAMILY",
          "MEHB DED INN TIER1 FAMILY",
          familyPerGroup,
        ),
        moopIndividual: preferTotal(
          r,
          "TEHB INN TIER 1 INDIVIDUAL MOOP",
          "MEHB INN TIER 1 INDIVIDUAL MOOP",
          money,
        ),
        moopFamily: preferTotal(
          r,
          "TEHB INN TIER 1 FAMILY MOOP",
          "MEHB INN TIER 1 FAMILY MOOP",
          familyPerGroup,
        ),
        pediatricOnly: adult === null || adult === 0,
        benefits: rows.map((b) => ({
          name: b.benefitName,
          isCovered: b.isCovered,
          // The number and its unit are filed separately and neither means
          // anything alone. "1" is not a limit; "1 Visit(s) per 6 Months" is.
          limit: [b.quantityLimit, b.quantityLimitUnit].filter(Boolean).join(" "),
          // Reproduced exactly as filed, including where the issuer's own text
          // is cut short. "Orthodontia require medical" is what one carrier
          // filed; completing it to "medical necessity" would be us writing
          // policy language on their behalf.
          exclusions: b.exclusions ?? "",
        })),
      };
    });

  return { planYear, plans, rates, serviceAreas: loadServiceAreas(dir, true) };
}

/**
 * Overlays the copay index built from carrier SBC documents.
 *
 * The filings themselves carry no copay columns, so these come from each
 * carrier's own published documents by way of scripts/build-copay-index.ts.
 * Applied here rather than in the cost model so that everything downstream,
 * including the browser bundle, sees one consistent plan object.
 */
function applyCopayIndex(plans: Plan[], indexPath: string): void {
  if (!existsSync(indexPath)) return;
  const index: Record<
    string,
    {
      primaryCare: number | null;
      specialist: number | null;
      beforeDeductible: boolean;
      coinsuredInstead?: boolean;
      source?: string;
    }
  > = JSON.parse(readFileSync(indexPath, "utf8"));
  for (const plan of plans) {
    const entry = index[plan.planId];
    if (!entry) continue;
    plan.copayPrimaryCare = entry.primaryCare;
    plan.copaySpecialist = entry.specialist;
    // A benefit schedule was read for this plan, whether or not it produced an
    // amount. A copay lifted out of the marketing name is not that: it gives an
    // amount and says nothing about anything else, so a plan sourced that way
    // and carrying no amount is a gap rather than an answer.
    plan.copaysRead = entry.source !== "plan-name";
    plan.copaysCoinsuredInstead = entry.coinsuredInstead === true;
    // The index value is the plan's own summary of benefits saying whether the
    // deductible applies, so it is taken as stated. It used to be overridden
    // whenever the plan was health savings account eligible, which silently
    // discarded a true reading: UnitedHealthcare's 2026 bronze plans are filed
    // HSA eligible and their SBCs state a $50 copay with the deductible not
    // applying, both of which are correct since section 71306 made every bronze
    // plan HSA compatible regardless of deductible structure. The one remaining
    // guard lives in the cost model, so there is a single rule rather than two
    // that can disagree.
    plan.copayBeforeDeductible = entry.beforeDeductible;
  }

  // A zero cost sharing variation charges the member nothing. All 37 of them
  // are filed with a deductible, an out of pocket maximum and a coinsurance
  // rate of zero, which is the signature of the variation rather than a
  // coincidence, and a plan whose out of pocket maximum is $0 cannot also
  // charge $30 to see a doctor.
  //
  // Two ways the wrong number got there. The copay index is keyed by plan id
  // but sourced from a benefit summary written for the standard variant, so
  // that variant's copay landed on the variation: 16 of the 37 were carrying
  // one. The rest had no index entry at all and sat at null, which reads as
  // "we do not know" when in fact it is the one cost we can state exactly.
  //
  // This runs over every plan rather than only those with an index entry,
  // because the amount follows from the filing and not from whether anyone
  // found a document. It has been invisible because rank.ts excludes these
  // variants from recommendations, but the wrong number still ships in the
  // browser bundle and would become a wrong answer the moment they surfaced.
  //
  // Guarded on the plan's own filed figures rather than on the variant label
  // alone, so a filing that ever disagreed would be left alone rather than
  // silently overwritten.
  for (const plan of plans) {
    if (
      plan.csrVariant !== "zeroCostSharing" ||
      plan.deductibleIndividual !== 0 ||
      plan.moopIndividual !== 0 ||
      plan.coinsurance !== 0
    )
      continue;
    plan.copayPrimaryCare = 0;
    plan.copaySpecialist = 0;
    plan.copayBeforeDeductible = true;
    plan.copaysCoinsuredInstead = false;
  }
}

export function loadPlanDataset(
  dataDir: string,
  planYear: number,
  copayIndexPath = "data/sbc/copays-by-plan.json",
): PlanDataset {
  const plans = loadPlans(dataDir);
  applyCopayIndex(plans, copayIndexPath);
  const benefits = loadBenefits(dataDir);
  applyPediatricDental(plans, benefits);
  return {
    planYear,
    plans,
    rates: loadRates(dataDir),
    serviceAreas: loadServiceAreas(dataDir, false),
    benefits,
  };
}

export { rateForAge, issuerCounties } from "./dataset.ts";


