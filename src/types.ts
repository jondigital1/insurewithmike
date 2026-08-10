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
   * pays the full allowed amount until the deductible is met and the copay only
   * bites afterwards. Taken from the plan's summary of benefits where we hold
   * one, and inferred from health savings account eligibility where we do not.
   */
  copayBeforeDeductible: boolean;
  /**
   * True when this plan's own benefit schedule was read, whatever it said.
   *
   * Distinguishes "we checked and there is no office visit copay" from "we hold
   * nothing for this plan", which look identical if you only store the amount.
   * The second is a gap that overstates the plan's cost; the first is an answer.
   */
  copaysRead: boolean;
  /**
   * True when the schedule was read and meters office visits by a coinsurance
   * percentage rather than a flat copay, which the plan's own coinsurance rate
   * already handles.
   */
  copaysCoinsuredInstead: boolean;

  /**
   * True when the plan's own benefit schedule covers children's dental.
   *
   * Only 24 of the 176 New Jersey medical plans do, and all 24 are
   * UnitedHealthcare. On the other 152 a household with a child under 19 has to
   * buy a standalone dental plan to get the same cover, which is real money the
   * premium does not show. Carried on the plan so the cost model can put the
   * two on the same footing instead of comparing a premium that includes
   * children's dental against one that does not.
   */
  embedsPediatricDental: boolean;

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
  /**
   * The rating area the rate was filed against, e.g. "Rating Area 1".
   *
   * Carried but not selected on. Every New Jersey medical plan is filed in
   * Rating Area 1 alone, so there is exactly one row per age and nothing to
   * choose between. It is kept so loadRates can detect the day that stops
   * being true rather than silently pricing off whichever row came first.
   */
  ratingArea: string;
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
  /**
   * The unit the quantity is counted in, e.g. "Visit(s) per 6 Months". Filed as
   * a separate column from the number, and meaningless without it: a limit of
   * "1" says nothing, "1 Visit(s) per 6 Months" is the benefit.
   */
  quantityLimitUnit: string | null;
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
 * A standalone dental plan, filed in the same public use files as the medical
 * plans and rated the same way: one rate per person per age band, no tobacco
 * loading, no family tier pricing, and no variation by rating area.
 *
 * Kept as its own type rather than folded into Plan because almost nothing
 * transfers. There is no metal level, no subsidy, no network tier and no
 * meaningful catastrophic exposure: the filed out of pocket maximum is a few
 * hundred dollars. What decides a dental plan is which categories it covers and
 * how often, so that is what this carries.
 */
export interface DentalPlan {
  planId: string;
  standardComponentId: string;
  issuerId: string;
  issuerName: string;
  marketingName: string;
  planType: string;
  deductibleIndividual: number | null;
  deductibleFamily: number | null;
  moopIndividual: number | null;
  moopFamily: number | null;
  /**
   * True when the plan files no adult rate, meaning it covers children only.
   * These exist to satisfy the pediatric essential health benefit and pricing
   * an adult on one would produce a zero rather than an answer.
   */
  pediatricOnly: boolean;
  benefits: DentalBenefit[];
}

/**
 * One filed benefit line on a dental plan, in the issuer's own categories.
 *
 * The limit and exclusion text is carried verbatim rather than parsed into
 * flags. "Orthodontia require medical necessity" is the difference between a
 * plan that pays for a child's braces and one that does not, and no boolean
 * we invent would survive contact with the next issuer's phrasing.
 */
export interface DentalBenefit {
  name: string;
  isCovered: boolean;
  /** Filed frequency limit, e.g. "1 Visit(s) per 6 Months". Empty when none. */
  limit: string;
  /** Filed exclusion text. Empty when none. */
  exclusions: string;
}

export interface DentalDataset {
  planYear: number;
  plans: DentalPlan[];
  rates: Map<string, RateRow[]>;
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
  /**
   * The carrier insuring them today, as the intake slug: "horizon",
   * "amerihealth", "oscar", "unitedhealthcare", "ambetter".
   *
   * Carried so the shortlist can always answer "can I just keep what I
   * have?", which is how many renewal conversations open. Absent for new
   * entrants, for carriers that left the market, and when the client did not
   * know.
   */
  currentInsurer?: string;
  /**
   * How they feel about that carrier, reported rather than predicted.
   *
   * keep anchors a staying-put option on the shortlist. leave suppresses it
   * and flags the agent to ask what went wrong. Neither ever removes the
   * carrier's plans from the ranking itself: an averse client with a $4,000
   * cheaper option at the carrier they hate deserves to weigh that with the
   * agent, priced, rather than have the choice made silently.
   */
  currentInsurerFeeling?: "keep" | "neutral" | "leave";
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
  /** Member share paid as flat office visit copays, outside the deductible. */
  copayApplied: number;
  /**
   * Whether a copay amount was available for the visits this household makes.
   *
   * False means those visits were priced at their full allowed charge against
   * the deductible, because the filings carry no copay amounts and we have not
   * recovered one for this plan from its summary of benefits. The figure is
   * then an overstatement rather than an answer, and pages should say so.
   */
  copaysKnown: boolean;
  /** Estimated out of pocket cost for care, after the maximum is applied. */
  estimatedOutOfPocket: number;
  /**
   * Where the out of pocket figure came from. "filed" means it is the issuer's
   * own filed coverage example for a scenario matching this client, which
   * already accounts for copays, limits and exclusions. "simulated" means it
   * was computed from the deductible and coinsurance, which cannot see copays.
   */
  outOfPocketSource: "filed" | "interpolated" | "simulated";
  /** True when estimated spending reaches the out of pocket maximum. */
  reachesMoop: boolean;
  /**
   * Standalone pediatric dental premium this household has to buy on top of
   * this plan, dollars for the year. Zero when the plan already covers
   * children's dental, and zero when there is no child under 19.
   *
   * Priced at the cheapest standalone plan in the filings rather than an
   * average, so it is the floor of what the gap costs rather than a guess at
   * what they would choose. Included in the annual total, because a comparison
   * that leaves it out is not comparing the same cover.
   */
  pediatricDentalPremium: number;

  /** Premium plus out of pocket, plus any pediatric dental bought separately. */
  estimatedAnnualTotal: number;
  /** Worst realistic year: premium plus the full out of pocket maximum. */
  worstCaseAnnualTotal: number;
  /**
   * What using a second tier provider costs on this plan, in dollars.
   *
   * Tiered plans quote their headline deductible and out of pocket maximum
   * against tier 1. A client whose hospital sits in tier 2 pays the tier 2
   * figures instead, and nothing on a comparison screen shows that. Null when
   * the plan is not tiered.
   */
  tierTwoPenalty: TierPenalty | null;
}

export interface TierPenalty {
  /** Extra deductible if care goes to a tier 2 provider. */
  extraDeductible: number;
  /** Extra exposure in a bad year. */
  extraWorstCase: number;
  /**
   * True when the plan files a second tier but with identical numbers, so the
   * tiering costs nothing in deductible or out of pocket terms. Worth saying,
   * because it looks alarming and is not.
   */
  nominalOnly: boolean;
}

export interface PlanEvaluation {
  plan: Plan;
  cost: CostBreakdown;
  /** Reasons this plan was excluded from consideration, empty when eligible. */
  disqualifiers: string[];
  /** Human readable notes for the agent, including data gaps. */
  notes: string[];
}
