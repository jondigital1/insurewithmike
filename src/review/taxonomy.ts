/**
 * The categories a plan_action note gets sorted into.
 *
 * This is a storage schema, not a screen. The agent never sees any of it: they
 * rule a plan out and say why in their own words, and the classifier maps
 * those words onto the codes below afterwards. Nobody picks from a list of
 * forty.
 *
 * Every code here is a guess until Mike's sessions land. The first few reviews
 * are deliberately captured with no categories at all, and the list is meant
 * to be rewritten against the language he actually uses rather than defended.
 * That is why the version stamp exists: relabelling the back catalogue is a
 * re-run of the classifier, not a migration.
 */

/** Bump when any code below changes meaning, is added, or is removed. */
export const TAXONOMY_VERSION = "2026-08-1";

/**
 * What the note is actually about, which decides what happens to it.
 *
 * The third case is the one that is easy to leave out and expensive to omit.
 * A plan dropped because the agent holds no appointment with the carrier is
 * not evidence about the plan, and if it lands in the same bucket as "the
 * deductible is too high for them" it quietly teaches the ranking to avoid a
 * carrier for a reason that has nothing to do with any client.
 */
export type ActionKind =
  /** A claim about the world that our data gets wrong. Raises a data ticket. */
  | "data_error"
  /** Right about the world, wrong about what matters to this client. Feeds ranking. */
  | "client_fit"
  /** About the agent's own economics. Logged, then excluded from ranking. */
  | "broker_economics";

export const ACTION_KINDS: readonly ActionKind[] = [
  "data_error",
  "client_fit",
  "broker_economics",
];

export type Topic =
  | "network"
  | "drugs"
  | "cost"
  | "preference"
  | "carrier"
  | "eligibility";

export const TOPICS: readonly Topic[] = [
  "network",
  "drugs",
  "cost",
  "preference",
  "carrier",
  "eligibility",
];

interface Detail {
  code: string;
  topic: Topic;
  /** The reading that makes this code the right one, written for the classifier. */
  means: string;
  /** Codes where the note names a provider, drug or hospital worth capturing. */
  wantsSubject?: boolean;
}

/**
 * Fine grained codes. Deliberately more specific than anything an agent would
 * be asked to pick from, because a model reading a sentence can afford
 * precision that a person mid-call cannot.
 */
export const DETAILS: readonly Detail[] = [
  // network
  { code: "provider_not_in_network", topic: "network", means: "a named doctor is not covered", wantsSubject: true },
  { code: "provider_directory_wrong", topic: "network", means: "our data says a provider is covered and the agent says it is not", wantsSubject: true },
  { code: "hospital_not_covered", topic: "network", means: "a hospital or health system is outside the network", wantsSubject: true },
  { code: "hospital_tier_two", topic: "network", means: "covered but at the worse tier, typically an OMNIA tier 2 placement", wantsSubject: true },
  { code: "cross_border_care", topic: "network", means: "the client uses providers outside New Jersey, usually Philadelphia" },
  { code: "no_out_of_network_benefit", topic: "network", means: "an EPO or narrow HMO leaves the client too exposed" },
  { code: "specialist_mid_treatment", topic: "network", means: "the client is under active care and cannot change specialist" , wantsSubject: true },
  { code: "network_other", topic: "network", means: "a network reason that fits none of the above" },

  // drugs
  { code: "drug_not_covered", topic: "drugs", means: "a prescription is absent from the formulary", wantsSubject: true },
  { code: "drug_tier_too_high", topic: "drugs", means: "covered but at a specialty or non preferred tier", wantsSubject: true },
  { code: "prior_auth_burden", topic: "drugs", means: "prior authorisation or step therapy makes the plan impractical", wantsSubject: true },
  { code: "drugs_other", topic: "drugs", means: "a prescription reason that fits none of the above" },

  // cost
  { code: "deductible_unaffordable", topic: "cost", means: "the client cannot carry the deductible even where the maths favours it" },
  { code: "oop_max_too_high", topic: "cost", means: "expected utilisation makes the out of pocket maximum the deciding figure" },
  { code: "premium_fixation", topic: "cost", means: "the client is deciding on the monthly premium regardless of total cost" },
  { code: "csr_silver_handling", topic: "cost", means: "cost sharing reductions make a silver plan better than our ranking shows" },
  { code: "wants_hsa", topic: "cost", means: "the client wants, or specifically does not want, an HSA qualified plan" },
  { code: "cost_other", topic: "cost", means: "a cost reason that fits none of the above" },

  // preference
  { code: "staying_with_carrier", topic: "preference", means: "the client will not leave their current carrier" },
  { code: "change_aversion", topic: "preference", means: "the client does not want to move plan at all" },
  { code: "referral_requirement", topic: "preference", means: "the client will not accept HMO referrals" },
  { code: "extras_wanted", topic: "preference", means: "dental, vision, fertility or another add on decided it" },
  { code: "preference_other", topic: "preference", means: "a client preference that fits none of the above" },

  // carrier
  { code: "carrier_service", topic: "carrier", means: "claims handling, billing or service reputation" },
  { code: "carrier_stability", topic: "carrier", means: "the carrier is new, leaving, or the plan is being discontinued" },
  { code: "carrier_other", topic: "carrier", means: "a carrier reason that fits none of the above" },

  // eligibility
  { code: "medicaid_eligible", topic: "eligibility", means: "the client should be on NJ FamilyCare rather than buying here" },
  { code: "aging_into_medicare", topic: "eligibility", means: "the client turns 65 during the plan year" },
  { code: "eligibility_other", topic: "eligibility", means: "an eligibility reason that fits none of the above" },

  // broker economics, quarantined on purpose
  { code: "not_appointed", topic: "carrier", means: "the agent holds no appointment with this carrier" },
  { code: "commission", topic: "carrier", means: "the plan pays the agent less, or nothing" },
  { code: "carrier_admin_burden", topic: "carrier", means: "the carrier's own enrolment or service process is painful for the agent" },
];

export const DETAIL_CODES: readonly string[] = DETAILS.map((d) => d.code);

/**
 * The codes that are about the agent rather than the client. A label carrying
 * one of these should be kind broker_economics, and every ranking query is
 * expected to exclude it.
 */
export const BROKER_ECONOMICS_CODES: readonly string[] = [
  "not_appointed",
  "commission",
  "carrier_admin_burden",
];

/** Codes worth asking "which provider, which drug" about. */
export const SUBJECT_CODES: readonly string[] = DETAILS.filter((d) => d.wantsSubject).map(
  (d) => d.code,
);

export function detailsFor(topic: Topic): readonly Detail[] {
  return DETAILS.filter((d) => d.topic === topic);
}

/** The code list, rendered for a classifier prompt. */
export function taxonomyForPrompt(): string {
  return TOPICS.map((topic) => {
    const lines = detailsFor(topic).map((d) => `  ${d.code}: ${d.means}`);
    return `${topic}\n${lines.join("\n")}`;
  }).join("\n\n");
}
