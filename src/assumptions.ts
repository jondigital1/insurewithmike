/**
 * Modelling assumptions that are NOT sourced from the plan filings.
 *
 * Every value in this file is an estimate standing in for data we do not yet
 * have. The New Jersey State-Based Exchange public use files describe whether
 * a benefit is covered, whether it is subject to the deductible, and what the
 * deductible, coinsurance and out of pocket maximum are. They do NOT carry the
 * per visit copay amounts that the federally facilitated marketplace files
 * carry. Until that gap is closed, cost estimates are driven by allowed
 * charges run through the deductible and coinsurance rather than by copays.
 *
 * Treat these numbers as a starting point to be replaced, not as facts.
 */

import type { ServiceCategory } from "./types.ts";

/**
 * Estimated in network allowed amount per unit of service in New Jersey,
 * in dollars. "Allowed amount" is the negotiated price the plan and provider
 * agree on, which is the base the deductible and coinsurance apply to.
 *
 * CONFIDENCE: low. These are round order of magnitude figures. Replace with
 * carrier specific allowed amounts or with the copay schedule from each plan's
 * Summary of Benefits and Coverage.
 */
export const ALLOWED_AMOUNTS: Record<ServiceCategory, number> = {
  primaryCareVisit: 150,
  specialistVisit: 275,
  urgentCare: 200,
  emergencyRoom: 2200,
  inpatientAdmission: 18000,
  outpatientSurgery: 5500,
  labWork: 120,
  advancedImaging: 1200,
  mentalHealthVisit: 180,
  physicalTherapy: 130,
  genericDrugMonths: 25,
  preferredBrandDrugMonths: 350,
  specialtyDrugMonths: 3800,
};

/**
 * Human readable labels for the intake form and the agent facing output.
 */
export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  primaryCareVisit: "Primary care visits",
  specialistVisit: "Specialist visits",
  urgentCare: "Urgent care visits",
  emergencyRoom: "Emergency room visits",
  inpatientAdmission: "Hospital admissions",
  outpatientSurgery: "Outpatient surgeries",
  labWork: "Lab tests",
  advancedImaging: "MRI, CT or PET scans",
  mentalHealthVisit: "Therapy or counselling visits",
  physicalTherapy: "Physical therapy visits",
  genericDrugMonths: "Months of generic prescriptions",
  preferredBrandDrugMonths: "Months of brand name prescriptions",
  specialtyDrugMonths: "Months of specialty prescriptions",
};

/**
 * 2025 HHS federal poverty guidelines for the 48 contiguous states, used to
 * determine 2026 coverage year subsidy and cost sharing reduction eligibility.
 *
 * CONFIDENCE: medium. Verify against the published guidelines before relying
 * on subsidy output in front of a client.
 */
export const FPL_BASE_2025 = 15650;
export const FPL_INCREMENT_2025 = 5500;

export function federalPovertyLevel(householdSize: number): number {
  return FPL_BASE_2025 + FPL_INCREMENT_2025 * Math.max(0, householdSize - 1);
}

export function fplPercentage(annualIncome: number, householdSize: number): number {
  return (annualIncome / federalPovertyLevel(householdSize)) * 100;
}

/**
 * New Jersey caps the number of children under 21 who are charged premium on
 * a single policy. Filed in the business rules file as MAX CHILDREN IN POLICY.
 */
export const MAX_RATED_CHILDREN = 3;
export const CHILD_RATING_AGE_CEILING = 20;
