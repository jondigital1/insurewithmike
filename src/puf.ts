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
  MetalLevel,
  Plan,
  PlanDataset,
  RateRow,
  ServiceArea,
} from "./types.ts";

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
      individualRate,
      individualTobaccoRate: money(r["INDIVIDUAL TOBACCO RATE"]),
    };
    const existing = byPlan.get(planId);
    if (existing) existing.push(row);
    else byPlan.set(planId, [row]);
  }
  return byPlan;
}

function loadServiceAreas(dir: string): ServiceArea[] {
  return readCsv(dir, "NJServiceAreas")
    .filter((r) => r["DENTAL PLAN ONLY"] === "No")
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
      exclusions: r["EXCLUSIONS"] || null,
    };
    const existing = byPlan.get(planId);
    if (existing) existing.push(row);
    else byPlan.set(planId, [row]);
  }
  return byPlan;
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
  return {
    planYear,
    plans,
    rates: loadRates(dataDir),
    serviceAreas: loadServiceAreas(dataDir),
    benefits: loadBenefits(dataDir),
  };
}

export { rateForAge, issuerCounties } from "./dataset.ts";


