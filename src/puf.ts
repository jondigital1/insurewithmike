/**
 * Loader for the CMS State-Based Exchange QHP Public Use Files, New Jersey.
 *
 * The files arrive as CSV exported from SERFF filings. Column names contain
 * spaces, money is formatted for humans, and several columns carry filing
 * typos that are reproduced faithfully here rather than corrected upstream.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import type {
  BenefitRow,
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

function loadPlans(dir: string): Plan[] {
  return readCsv(dir, "NJPlans")
    .filter((r) => r["DENTAL ONLY PLAN"] === "No")
    .map((r): Plan => {
      const issuerId = r["ISSUER ID"] ?? "";
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

export function loadPlanDataset(dataDir: string, planYear: number): PlanDataset {
  return {
    planYear,
    plans: loadPlans(dataDir),
    rates: loadRates(dataDir),
    serviceAreas: loadServiceAreas(dataDir),
    benefits: loadBenefits(dataDir),
  };
}

/**
 * Resolves a member age to the filed rate for a plan. Age bands in the file
 * are a mixture of single years ("27"), a banded floor ("0-14") and a banded
 * ceiling ("64 and over").
 */
export function rateForAge(
  rates: RateRow[],
  age: number,
  tobaccoUser: boolean,
): number | null {
  const exact = rates.find((r) => Number(r.age) === age);
  const banded =
    exact ??
    rates.find((r) => {
      const range = r.age.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) return age >= Number(range[1]) && age <= Number(range[2]);
      const ceiling = r.age.match(/^(\d+)\s*and\s*over$/i);
      if (ceiling) return age >= Number(ceiling[1]);
      const floor = r.age.match(/^(\d+)\s*and\s*under$/i);
      if (floor) return age <= Number(floor[1]);
      return false;
    });
  if (!banded) return null;
  return tobaccoUser
    ? (banded.individualTobaccoRate ?? banded.individualRate)
    : banded.individualRate;
}

/** Counties where an issuer sells, used to gate plan availability. */
export function issuerCounties(dataset: PlanDataset, issuerId: string): Set<string> {
  const counties = new Set<string>();
  for (const area of dataset.serviceAreas) {
    if (area.issuerId === issuerId && area.countyName) counties.add(area.countyName);
  }
  return counties;
}
