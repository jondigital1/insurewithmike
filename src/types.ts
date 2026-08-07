/**
 * Domain types for the New Jersey individual marketplace plan engine.
 *
 * Source of plan data: CMS State-Based Exchange QHP Public Use Files,
 * New Jersey, plan year 2026 (SERFF filings via NAIC).
 */

export type MetalLevel =
  | "Catastrophic"
  | "Expanded Bronze"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum";

/**
 * Cost sharing reduction variant. New Jersey silver plans are filed at four
 * levels; which one a household receives is determined by income as a
 * percentage of the federal poverty level, not by choice.
 */
export type CsrVariant =
  | "standard"
  | "csr73"
  | "csr87"
  | "csr94"
  | "zeroCostSharing"
  | "limitedCostSharing";

export interface Plan {
  /** Full 16 character plan id including variant suffix, e.g. 91661NJ2270001-01 */
  planId: string;
  /** 14 character base plan id shared by every variant, e.g. 91661NJ2270001 */
  standardComponentId: string;
  issuerId: string;
  issuerName: string;
  marketingName: string;
  metalLevel: MetalLevel;
  planType: string;
  csrVariant: CsrVariant;
  networkId: string;
  formularyId: string;
  serviceAreaId: string;
  hsaEligible: boolean;
  /** Issuer filed actuarial value, 0 to 1 */
  actuarialValue: number | null;

  /** In network tier 1 individual deductible, dollars. Null when not filed. */
  deductibleIndividual: number | null;
  /** In network tier 1 family deductible, per group, dollars. */
  deductibleFamily: number | null;
  /** Default in network coinsurance the member pays after deductible, 0 to 1. */
  coinsurance: number | null;
  /** In network tier 1 individual out of pocket maximum, dollars. */
  moopIndividual: number | null;
  /** In network tier 1 family out of pocket maximum, per group, dollars. */
  moopFamily: number | null;

  /**
   * Office visit copays, where the issuer states them in the plan's marketing
   * name, for example "IHC Silver EPO AmeriHealth Advantage $25/$60". The
   * filings carry no copay columns, so this is the only copay data in the
   * dataset. Only AmeriHealth names their plans this way.
   */
  copayPrimaryCare: number | null;
  copaySpecialist: number | null;
  /**
   * True when the copay applies from the first visit. When false the member
   * pays the full allowed amount until the deductible is met, and the copay
   * only bites afterwards, which is the rule for health savings account plans.
   */
  copayBeforeDeductible: boolean;

  /** True when the plan files a distinct second network tier. */
  hasSecondNetworkTier: boolean;
  deductibleIndividualTier2: number | null;
  moopIndividualTier2: number | null;

  /**
   * The three standardised coverage examples every issuer must file, giving
   * the member's actual dollar share broken into components. These are the
   * only filed cost sharing outcomes we have, and the only ground truth
   * available for testing the cost model.
   */
  coverageExamples: Record<CoverageScenario, CoverageExample | null>;
}

/** CMS standardised scenarios, identical in service mix across every plan. */
export type CoverageScenario = "havingABaby" | "managingDiabetes" | "simpleFracture";

export interface CoverageExample {
  deductible: number;
  copayment: number;
  coinsurance: number;
  limits: number;
  /** What the member pays in total for the scenario. */
  total: number;
}

export interface RateRow {
  planId: string;
  /** Age band label as filed, e.g. "0-14", "21", "64 and over" */
  age: string;
  individualRate: number;
  individualTobaccoRate: number | null;
}

export interface ServiceArea {
  serviceAreaId: string;
  issuerId: string;
  countyName: string;
  coversEntireState: boolean;
}

export interface BenefitRow {
  planId: string;
  standardComponentId: string;
  benefitName: string;
  isCovered: boolean;
  isEhb: boolean;
  isStateMandate: boolean;
  subjectToDeductibleTier1: boolean | null;
  excludedFromInnMoop: boolean | null;
  quantityLimit: string | null;
  exclusions: string | null;
}

export interface PlanDataset {
  planYear: number;
  plans: Plan[];
  rates: Map<string, RateRow[]>;
  serviceAreas: ServiceArea[];
  benefits: Map<string, BenefitRow[]>;
}

/**
 * Service categories the intake form asks about. These are deliberately
 * phrased as things a client can actually count, not as insurance jargon.
 */
export type ServiceCategory =
  | "primaryCareVisit"
  | "specialistVisit"
  | "urgentCare"
  | "emergencyRoom"
  | "inpatientAdmission"
  | "outpatientSurgery"
  | "labWork"
  | "advancedImaging"
  | "mentalHealthVisit"
  | "physicalTherapy"
  | "genericDrugMonths"
  | "preferredBrandDrugMonths"
  | "specialtyDrugMonths";

export type Utilization = Partial<Record<ServiceCategory, number>>;

export interface HouseholdMember {
  /** Age on the plan effective date. */
  age: number;
  tobaccoUser: boolean;
  utilization: Utilization;
}

export interface Household {
  county: string;
  /** Modified adjusted gross income for the coverage year, dollars. */
  annualIncome: number;
  /** Household size for federal poverty level purposes. */
  householdSize: number;
  members: HouseholdMember[];
  /** Health systems the household wants to keep, e.g. ["Penn", "Jefferson"]. */
  preferredHealthSystems: string[];
  /** Plan id of the coverage they hold today, when known. */
  currentPlanId?: string;
  /** What the client believes they spent out of pocket last year. */
  perceivedAnnualSpend?: number;
  /**
   * Set when the household holds an approved hardship or affordability
   * exemption, which is the only route into catastrophic coverage for anyone
   * aged 30 or over.
   */
  hardshipExemption?: boolean;
  /**
   * Set when the client's year closely resembles one of the standardised
   * coverage examples, from the intake answers on ongoing conditions and
   * planned care. When present the engine uses the filed member cost for that
   * scenario instead of simulating cost sharing, because the filing already
   * accounts for copays, limits and exclusions that the simulation cannot see.
   */
  expectedScenario?: CoverageScenario;
  /**
   * Months of coverage remaining in the plan year, 1 to 12.
   *
   * A special enrolment period starts coverage part way through the year. The
   * premium is then paid for fewer months, and the household has fewer months
   * of care, but the deductible and out of pocket maximum do not shrink to
   * match. That changes which plan is cheapest, so it is modelled rather than
   * assumed to be a full year.
   */
  monthsOfCoverage?: number;
}

export interface CostBreakdown {
  /** Twelve months of premium at the filed list rate, before any subsidy. */
  annualPremiumListed: number;
  /** Federal advance premium tax credit applied to this plan, dollars. */
  federalSubsidyApplied: number;
  /**
   * Estimated New Jersey Health Plan Savings applied to this plan, dollars.
   * An average rather than a computed entitlement, because the state does not
   * publish the schedule.
   */
  stateSubsidyApplied: number;
  /** List premium less both subsidies. Never below zero. */
  annualPremiumNet: number;
  /** Twelve months of premium the agent actually quoted, when supplied. */
  annualPremiumQuoted: number | null;
  /** Estimated allowed charges across the household for the year. */
  estimatedAllowedCharges: number;
  /** Member share applied to the deductible. */
  deductibleApplied: number;
  /** Member share paid as coinsurance after the deductible. */
  coinsuranceApplied: number;
  /** Estimated out of pocket cost for care, after the maximum is applied. */
  estimatedOutOfPocket: number;
  /**
   * Where the out of pocket figure came from. "filed" means it is the issuer's
   * own filed coverage example for a scenario matching this client, which
   * already accounts for copays, limits and exclusions. "simulated" means it
   * was computed from the deductible and coinsurance, which cannot see copays.
   */
  outOfPocketSource: "filed" | "simulated";
  /** True when estimated spending reaches the out of pocket maximum. */
  reachesMoop: boolean;
  /** Premium plus out of pocket. Uses the quoted premium when available. */
  estimatedAnnualTotal: number;
  /** Worst realistic year: premium plus the full out of pocket maximum. */
  worstCaseAnnualTotal: number;
}

export interface PlanEvaluation {
  plan: Plan;
  cost: CostBreakdown;
  /** Reasons this plan was excluded from consideration, empty when eligible. */
  disqualifiers: string[];
  /** Human readable notes for the agent, including data gaps. */
  notes: string[];
}
