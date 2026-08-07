/**
 * The client intake questionnaire.
 *
 * This is the source of truth. The client facing form, the validation rules
 * and the review document are all generated from it, so they cannot drift
 * apart.
 *
 * Two design rules run through the whole thing.
 *
 * First, "I am not sure" is a real answer everywhere it could honestly apply.
 * A form that lets someone finish without actually answering is worse than no
 * form, because it hands the agent a false starting point. An explicit unsure
 * flags for follow up; a silent blank does not.
 *
 * Second, people are asked what they know and the system derives what they do
 * not. Nobody can recall how much they spent on healthcare last year, but most
 * people can say roughly how many times they saw a doctor.
 *
 * Routing tags follow docs/application-fields.md. Nothing tagged `crm` appears
 * in this questionnaire; the tag exists so the omissions are deliberate and
 * reviewable rather than accidental.
 */

export type Routing =
  /** Answer is stored by us and feeds the recommendation. */
  | "intake"
  /** Needed to submit the government application but not to recommend. */
  | "application"
  /** Surfaced to the agent as a flag rather than used in the maths. */
  | "flag";

export type QuestionKind =
  | "code"
  | "choice"
  | "multichoice"
  | "boolean"
  | "number"
  | "currency"
  | "text"
  | "longtext"
  | "person"
  | "repeater";

export interface Option {
  value: string;
  label: string;
  /** Numeric value used by the engine when the label is a range. */
  midpoint?: number;
  /** Reveals the named questions when this option is selected. */
  reveals?: string[];
}

export interface Question {
  id: string;
  kind: QuestionKind;
  label: string;
  help?: string;
  options?: Option[];
  /** Placeholder or unit hint shown beside the input. */
  unit?: string;
  required: boolean;
  /** Offer an explicit "I am not sure" that flags for the agent. */
  allowUnsure?: boolean;
  /** Only shown when this expression is satisfied. */
  showIf?: { question: string; equals: string[] };
  /** Asked once per household member. */
  perPerson?: boolean;
  routing: Routing;
  /** Why this question exists, shown in review mode only. */
  rationale?: string;
}

export interface Section {
  id: string;
  title: string;
  blurb?: string;
  /** Which half of the form this belongs to. */
  half: "eligibility" | "fit";
  questions: Question[];
}

const NJ_COUNTIES = [
  "Atlantic", "Bergen", "Burlington", "Camden", "Cape May", "Cumberland",
  "Essex", "Gloucester", "Hudson", "Hunterdon", "Mercer", "Middlesex",
  "Monmouth", "Morris", "Ocean", "Passaic", "Salem", "Somerset", "Sussex",
  "Union", "Warren",
].map((c) => ({ value: c.toLowerCase().replace(/\s+/g, "-"), label: `${c} County` }));

/** Visit count bands. Far easier to answer than an exact number, and the
 *  midpoint is accurate enough for a cost estimate. */
const VISIT_BANDS: Option[] = [
  { value: "0", label: "None", midpoint: 0 },
  { value: "1-2", label: "1 or 2", midpoint: 1.5 },
  { value: "3-5", label: "3 to 5", midpoint: 4 },
  { value: "6-10", label: "6 to 10", midpoint: 8 },
  { value: "11-20", label: "11 to 20", midpoint: 15 },
  { value: "21+", label: "More than 20", midpoint: 26 },
];

const RARE_BANDS: Option[] = [
  { value: "0", label: "None", midpoint: 0 },
  { value: "1", label: "Once", midpoint: 1 },
  { value: "2-3", label: "2 or 3", midpoint: 2.5 },
  { value: "4+", label: "4 or more", midpoint: 5 },
];

const FREQUENCIES: Option[] = [
  { value: "hourly", label: "Per hour" },
  { value: "weekly", label: "Per week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "semimonthly", label: "Twice a month" },
  { value: "monthly", label: "Per month" },
  { value: "yearly", label: "Per year" },
];

export const QUESTIONNAIRE: Section[] = [
  {
    id: "start",
    title: "Getting started",
    blurb:
      "Your agent gave you a code when they sent you here. It links your answers back to your file.",
    half: "eligibility",
    questions: [
      {
        id: "client_code",
        kind: "code",
        label: "Enter the code your agent gave you",
        help: "Six characters, letters and numbers. Not case sensitive.",
        required: true,
        routing: "intake",
        rationale:
          "Randomly generated per agency. Opens a blank form and locks on submission, so a leaked code exposes nothing.",
      },
      {
        id: "coverage_situation",
        kind: "choice",
        label: "Which of these sounds like you?",
        options: [
          { value: "renewing", label: "I have a health plan now and I am looking at next year" },
          { value: "new", label: "I do not have a health plan and I need one" },
          { value: "losing", label: "I am about to lose the coverage I have" },
        ],
        required: true,
        routing: "intake",
        rationale:
          "Forks the whole form. Renewals anchor on the current plan; 16 plans were discontinued for 2026, so some renewals are forced moves.",
      },
      {
        id: "life_changes",
        kind: "multichoice",
        label: "Has anything changed for your household lately, or is anything about to?",
        help: "Tick anything that applies. Several of these let you sign up outside the usual window, and several change how much help you can get.",
        options: [
          { value: "lost_coverage", label: "Someone lost health coverage, or is about to" },
          { value: "job_change", label: "Someone lost a job or changed jobs" },
          { value: "married", label: "Got married" },
          { value: "divorced", label: "Got divorced or legally separated" },
          { value: "baby", label: "Had a baby, adopted, or took in a foster child" },
          { value: "moved", label: "Moved to a new address" },
          { value: "aged_off", label: "Someone turned 26 and came off a parent's plan" },
          { value: "death", label: "Someone in the household died" },
          { value: "income_change", label: "Income went up or down a lot" },
          { value: "status_change", label: "Became a citizen, or got lawful immigration status" },
          { value: "released", label: "Someone was released from incarceration" },
          { value: "none", label: "Nothing has changed" },
        ],
        required: true,
        routing: "flag",
        rationale:
          "Outside open enrolment a qualifying life event is the only way to enrol at all, and the window is usually 60 days. Marriage and divorce also change the tax household, which changes both the credit and the cost sharing tier, and a job loss makes last year's income the wrong number to quote on.",
      },
      {
        id: "coverage_start",
        kind: "choice",
        label: "When do you need the coverage to start?",
        options: [
          { value: "asap", label: "As soon as it can" },
          { value: "january", label: "1 January, with the new plan year" },
          { value: "unsure", label: "I am not sure yet" },
        ],
        required: true,
        routing: "intake",
        rationale:
          "Starting part way through the year changes which plan wins, not just the totals. Premium is only paid for the remaining months, but the deductible and out of pocket maximum stay at their full annual amounts, so a high deductible plan is much worse with four months left than with twelve.",
      },
      {
        id: "life_change_when",
        kind: "choice",
        label: "When did that happen?",
        help: "If more than one thing changed, answer for the most recent.",
        options: [
          { value: "upcoming", label: "It has not happened yet, but it will soon" },
          { value: "within60", label: "In the last 60 days" },
          { value: "over60", label: "More than 60 days ago" },
        ],
        required: true,
        allowUnsure: true,
        showIf: {
          question: "life_changes",
          equals: [
            "lost_coverage", "job_change", "married", "divorced", "baby", "moved",
            "aged_off", "death", "income_change", "status_change", "released",
          ],
        },
        routing: "flag",
        rationale:
          "Special enrolment periods generally run 60 days from the event, and losing coverage can be claimed 60 days ahead of it. Past that window the client waits for open enrolment, so the date decides whether there is anything to sell today.",
      },
    ],
  },

  {
    id: "household",
    title: "Who needs covering",
    blurb:
      "Include everyone on your tax return, even people who already have insurance. The number of people in your household affects the help you can get, so leaving someone out can cost you money.",
    half: "eligibility",
    questions: [
      {
        id: "household_size",
        kind: "number",
        label: "How many people are on your federal tax return, including you?",
        unit: "people",
        required: true,
        routing: "intake",
        rationale: "Sets the federal poverty level, which drives both the subsidy and the silver cost sharing tier.",
      },
      {
        id: "person_age",
        kind: "number",
        label: "Age on 1 January",
        unit: "years",
        required: true,
        perPerson: true,
        routing: "intake",
        rationale:
          "Age is the only personal characteristic that changes the premium in New Jersey. We ask for age rather than date of birth on purpose.",
      },
      {
        id: "person_relationship",
        kind: "choice",
        label: "Relationship to you",
        options: [
          { value: "self", label: "This is me" },
          { value: "spouse", label: "Spouse" },
          { value: "child", label: "Child" },
          { value: "other", label: "Other dependent" },
        ],
        required: true,
        perPerson: true,
        routing: "intake",
      },
      {
        id: "person_needs_coverage",
        kind: "boolean",
        label: "Does this person need coverage on the new plan?",
        help: "Answer no for anyone who already has Medicare, military coverage or their own plan.",
        required: true,
        perPerson: true,
        routing: "intake",
        rationale: "Counted for the poverty level either way, but only priced if they are enrolling.",
      },
      {
        id: "pregnancy",
        kind: "boolean",
        label: "Is anyone in the household pregnant?",
        required: true,
        routing: "intake",
        rationale:
          "Two reasons. It changes eligibility, and a birth is the largest predictable cost event in any plan year. The filings carry a standard maternity cost example for every plan.",
      },
      {
        id: "pregnancy_due",
        kind: "choice",
        label: "Roughly when is the baby due?",
        options: [
          { value: "q1", label: "January to March" },
          { value: "q2", label: "April to June" },
          { value: "q3", label: "July to September" },
          { value: "q4", label: "October to December" },
        ],
        required: true,
        showIf: { question: "pregnancy", equals: ["yes"] },
        routing: "intake",
      },
      {
        id: "tribal_member",
        kind: "boolean",
        label: "Is anyone in the household a member of a federally recognised tribe?",
        help: "This can qualify you for plans with no cost sharing at all, so it is worth answering carefully.",
        required: true,
        routing: "intake",
        rationale:
          "Unlocks the zero and limited cost sharing variants. The engine currently excludes 74 of 176 plan variants on this basis alone.",
      },
      {
        id: "foster_care",
        kind: "boolean",
        label: "Was anyone in the household in foster care at age 18 or older?",
        help: "If so, they may qualify for free coverage until they turn 26.",
        required: true,
        routing: "flag",
        rationale: "Easy to miss, and the answer is free coverage. Flags for the agent rather than feeding the maths.",
      },
    ],
  },

  {
    id: "location",
    title: "Where you live",
    half: "eligibility",
    questions: [
      {
        id: "county",
        kind: "choice",
        label: "Which county do you live in?",
        help: "New Jersey charges the same premium statewide, so this only affects which insurers can sell to you.",
        options: NJ_COUNTIES,
        required: true,
        routing: "intake",
        rationale:
          "Not a pricing input. New Jersey uses a single rating area. But Ambetter sells in only 17 of 21 counties, so it gates availability.",
      },
    ],
  },

  {
    id: "income",
    title: "Income",
    blurb:
      "This decides how much help you get paying for coverage, and it is the single biggest factor in what you will actually pay. We do not ask where you work.",
    half: "eligibility",
    questions: [
      {
        id: "will_file_taxes",
        kind: "boolean",
        label: "Do you plan to file a federal tax return for next year?",
        help: "You can still get coverage if you do not, but the help paying for it requires a return.",
        required: true,
        routing: "intake",
        rationale: "No return, no premium tax credit. A hard gate rather than a preference.",
      },
      {
        id: "filing_jointly",
        kind: "boolean",
        label: "Will you file jointly with your spouse?",
        required: true,
        showIf: { question: "will_file_taxes", equals: ["yes"] },
        routing: "intake",
        rationale: "Married filing separately generally forfeits the credit entirely.",
      },
      {
        id: "employment_status",
        kind: "choice",
        label: "How do you earn money?",
        options: [
          { value: "employed", label: "I work for an employer" },
          { value: "self", label: "I am self employed or run my own business" },
          { value: "both", label: "Both" },
          { value: "retired", label: "I am retired" },
          { value: "none", label: "I am not working right now" },
        ],
        required: true,
        perPerson: true,
        routing: "intake",
      },
      {
        id: "wages",
        kind: "currency",
        label: "Wages before tax",
        required: true,
        perPerson: true,
        showIf: { question: "employment_status", equals: ["employed", "both"] },
        routing: "intake",
      },
      {
        id: "wages_frequency",
        kind: "choice",
        label: "How often?",
        options: FREQUENCIES,
        required: true,
        perPerson: true,
        showIf: { question: "employment_status", equals: ["employed", "both"] },
        routing: "intake",
      },
      {
        id: "self_employment_net",
        kind: "currency",
        label: "Net business income per month, after expenses",
        help: "What is left once you have paid business expenses, not what came in.",
        required: true,
        perPerson: true,
        allowUnsure: true,
        showIf: { question: "employment_status", equals: ["self", "both"] },
        routing: "intake",
      },
      {
        id: "other_income",
        kind: "multichoice",
        label: "Does anyone receive any of these?",
        help: "Do not include child support, veterans payments or Supplemental Security Income. Those do not count.",
        options: [
          { value: "social_security", label: "Social Security" },
          { value: "pension", label: "Pension" },
          { value: "retirement", label: "Withdrawals from retirement accounts" },
          { value: "unemployment", label: "Unemployment" },
          { value: "rental", label: "Rental or royalty income" },
          { value: "alimony_received", label: "Alimony, from a divorce finalised before 2019" },
          { value: "farming", label: "Farming or fishing income" },
          { value: "other", label: "Something else" },
          { value: "none", label: "None of these" },
        ],
        required: true,
        routing: "intake",
        rationale: "All of it counts toward modified adjusted gross income, which is what the subsidy is calculated on.",
      },
      {
        id: "deductions",
        kind: "multichoice",
        label: "Do you pay any of these?",
        help: "These lower the income we count, which usually increases the help you get. Worth checking.",
        options: [
          { value: "student_loan_interest", label: "Student loan interest" },
          { value: "alimony_paid", label: "Alimony, from a divorce finalised before 2019" },
          { value: "hsa", label: "Contributions to a health savings account" },
          { value: "ira", label: "Contributions to a traditional IRA" },
          { value: "none", label: "None of these" },
        ],
        required: true,
        routing: "intake",
        rationale: "Routinely forgotten, and they move the subsidy in the client's favour.",
      },
      {
        id: "expected_income",
        kind: "currency",
        label: "Your best estimate of total household income for next year",
        help: "Before tax, everyone combined. An estimate is fine, but try to be realistic rather than optimistic.",
        required: true,
        routing: "intake",
        rationale:
          "The subsidy is computed on projected income, not last year's. Getting this wrong is reconciled at tax time.",
      },
      {
        id: "income_stability",
        kind: "choice",
        label: "How steady is that income?",
        options: [
          { value: "steady", label: "Steady, I know roughly what I will earn" },
          { value: "varies", label: "It varies a fair bit month to month" },
          { value: "unpredictable", label: "Honestly, I have no idea" },
        ],
        required: true,
        routing: "flag",
        rationale:
          "The 400 percent cliff is back for 2026. Someone projecting 395 percent who lands at 405 repays the entire credit. Volatility near the line needs a conversation, not a calculation.",
      },
    ],
  },

  {
    id: "current_coverage",
    title: "What you have now",
    half: "eligibility",
    questions: [
      {
        id: "current_insurer",
        kind: "choice",
        label: "Who is your health plan with right now?",
        options: [
          { value: "horizon", label: "Horizon Blue Cross Blue Shield" },
          { value: "amerihealth", label: "AmeriHealth" },
          { value: "oscar", label: "Oscar" },
          { value: "unitedhealthcare", label: "UnitedHealthcare or Oxford" },
          { value: "ambetter", label: "Ambetter or WellCare" },
          { value: "aetna", label: "Aetna" },
          { value: "other", label: "Someone else" },
        ],
        required: true,
        allowUnsure: true,
        showIf: { question: "coverage_situation", equals: ["renewing", "losing"] },
        routing: "intake",
        rationale:
          "Sets the renewal baseline. Aetna is listed because it left the market for 2026, and anyone answering Aetna is a forced move.",
      },
      {
        id: "current_plan_name",
        kind: "text",
        label: "What is the plan called?",
        help: "It is printed on your insurance card. Something like OMNIA Silver or Bronze Classic.",
        required: false,
        allowUnsure: true,
        showIf: { question: "coverage_situation", equals: ["renewing", "losing"] },
        routing: "intake",
        rationale:
          "Match on carrier and name, not just identifier. Horizon retired OMNIA Silver and filed a new plan under the same name, so identifier matching alone gets this wrong.",
      },
      {
        id: "current_premium",
        kind: "currency",
        label: "What do you pay each month for it?",
        help: "The amount that actually leaves your account, after any help you already receive.",
        required: false,
        allowUnsure: true,
        showIf: { question: "coverage_situation", equals: ["renewing", "losing"] },
        routing: "intake",
        rationale: "The anchor the client will judge every option against.",
      },
      {
        id: "employer_offer",
        kind: "boolean",
        label:
          "Is health insurance available to anyone in your household through a job, including your spouse's or a parent's job?",
        help: "Answer yes even if you turned it down because it was too expensive.",
        required: true,
        routing: "flag",
        rationale:
          "The most dangerous question on the form. An affordable employer offer that meets the minimum value standard bars the household from the premium tax credit entirely. On a sample family that credit was $12,228 a year. One screening question, not the full employer branch.",
      },
      {
        id: "employer_offer_cost",
        kind: "currency",
        label: "Roughly what would it cost per month to cover just that one employee?",
        help: "Not the family rate. Just the employee on their own. Your agent will confirm the details.",
        required: false,
        allowUnsure: true,
        showIf: { question: "employer_offer", equals: ["yes"] },
        routing: "flag",
        rationale: "The affordability test runs on the employee only rate, which surprises almost everybody.",
      },
    ],
  },

  {
    id: "doctors",
    title: "Your doctors and hospitals",
    blurb:
      "This is the part that usually decides which plan is right. Every plan sold in New Jersey has its own network, and a plan that looks cheaper is a bad deal if it drops your doctor.",
    half: "fit",
    questions: [
      {
        id: "health_system",
        kind: "multichoice",
        label: "Which hospitals or health systems does your family use?",
        options: [
          { value: "penn", label: "Penn Medicine" },
          { value: "jefferson", label: "Jefferson Health" },
          { value: "inspira", label: "Inspira Health" },
          { value: "cooper", label: "Cooper University Health Care" },
          { value: "virtua", label: "Virtua Health" },
          { value: "atlanticare", label: "AtlantiCare" },
          { value: "rwjbarnabas", label: "RWJBarnabas Health" },
          { value: "hackensack", label: "Hackensack Meridian Health" },
          { value: "other", label: "Somewhere else" },
          { value: "none", label: "We do not really have one" },
        ],
        required: true,
        allowUnsure: true,
        routing: "intake",
        rationale:
          "Some plans put a whole system in a worse tier rather than excluding it. On Horizon OMNIA Gold, a tier 2 hospital nearly quadruples the deductible.",
      },
      {
        id: "primary_care_doctor",
        kind: "text",
        label: "Name of the doctor you see most",
        help: "First and last name is enough. Leave blank if you do not have one you want to keep.",
        required: false,
        routing: "intake",
      },
      {
        id: "specialists",
        kind: "repeater",
        label: "Any specialists you want to keep seeing?",
        help: "Name and what they treat. Add as many as you need.",
        required: false,
        routing: "intake",
      },
      {
        id: "network_priority",
        kind: "choice",
        label: "How important is keeping these doctors?",
        options: [
          { value: "must", label: "Very. I do not want to change doctors" },
          { value: "prefer", label: "I would rather keep them, but I would listen" },
          { value: "flexible", label: "I would change doctors to save real money" },
          { value: "none", label: "No strong feelings" },
        ],
        required: true,
        routing: "intake",
        rationale:
          "Turns network from a hard filter into a weighting. Without it the engine cannot tell whether to exclude a plan or merely note the trade off.",
      },
      {
        id: "network_price",
        kind: "currency",
        label: "How much would you need to save in a year to make changing worth it?",
        required: false,
        allowUnsure: true,
        showIf: { question: "network_priority", equals: ["flexible", "prefer"] },
        routing: "intake",
      },
    ],
  },

  {
    id: "prescriptions",
    title: "Prescriptions",
    blurb: "Plans cover different drugs at different prices, so this can change the answer completely.",
    half: "fit",
    questions: [
      {
        id: "takes_medication",
        kind: "boolean",
        label: "Does anyone take prescription medication regularly?",
        help: "Regularly means most months, not a one off course of antibiotics.",
        required: true,
        routing: "intake",
      },
      {
        id: "medications",
        kind: "repeater",
        label: "Which ones?",
        help: "The name and the dose, both printed on the bottle. If you can, go and look rather than guessing.",
        required: false,
        showIf: { question: "takes_medication", equals: ["yes"] },
        routing: "intake",
        rationale:
          "The plan data gives us a formulary identifier but no drug list, so this currently produces a flag for the agent rather than an automatic check.",
      },
      {
        id: "specialty_drug",
        kind: "boolean",
        label: "Is any of it an injection, an infusion, or something the pharmacy has to order in specially?",
        help: "These are usually the most expensive drugs, and plans treat them very differently.",
        required: false,
        showIf: { question: "takes_medication", equals: ["yes"] },
        routing: "intake",
        rationale: "Specialty drugs dominate a household's costs when present. Worth its own question.",
      },
    ],
  },

  {
    id: "last_year",
    title: "Last year",
    blurb:
      "Rough numbers are genuinely fine. We are working out the shape of your year, not auditing you. Answer for everyone on the plan combined.",
    half: "fit",
    questions: [
      {
        id: "visits_primary",
        kind: "choice",
        label: "Visits to a regular doctor or family doctor",
        options: VISIT_BANDS,
        required: true,
        routing: "intake",
      },
      {
        id: "visits_specialist",
        kind: "choice",
        label: "Visits to a specialist",
        help: "Skin, heart, joints, allergies, anything like that.",
        options: VISIT_BANDS,
        required: true,
        routing: "intake",
      },
      {
        id: "visits_urgent",
        kind: "choice",
        label: "Urgent care or walk in clinic visits",
        options: RARE_BANDS,
        required: true,
        routing: "intake",
      },
      {
        id: "visits_er",
        kind: "choice",
        label: "Emergency room visits",
        options: RARE_BANDS,
        required: true,
        routing: "intake",
      },
      {
        id: "hospital_stays",
        kind: "choice",
        label: "Nights spent in hospital",
        options: RARE_BANDS,
        required: true,
        routing: "intake",
      },
      {
        id: "surgeries",
        kind: "choice",
        label: "Operations or procedures that did not need an overnight stay",
        options: RARE_BANDS,
        required: true,
        routing: "intake",
      },
      {
        id: "imaging",
        kind: "choice",
        label: "Scans such as MRI, CT or PET",
        options: RARE_BANDS,
        required: true,
        routing: "intake",
      },
      {
        id: "therapy",
        kind: "choice",
        label: "Therapy or counselling sessions",
        options: VISIT_BANDS,
        required: true,
        routing: "intake",
      },
      {
        id: "physical_therapy",
        kind: "choice",
        label: "Physical therapy or chiropractic visits",
        options: VISIT_BANDS,
        required: true,
        routing: "intake",
        rationale:
          "Plans cap these at 30 visits a year, filed explicitly in the benefit data. Anyone in ongoing therapy will hit the ceiling, and that is a real differentiator.",
      },
      {
        id: "perceived_spend",
        kind: "currency",
        label: "Roughly what do you think all of that cost you out of pocket?",
        help:
          "Not counting your monthly premium. Copays, deductibles, prescriptions. A guess is fine, and we will show you what our numbers say.",
        required: false,
        allowUnsure: true,
        routing: "intake",
        rationale:
          "The anchor the client judges everything against. When our computed figure disagrees with their belief, that gap is worth showing rather than hiding, because it usually means they forgot something.",
      },
    ],
  },

  {
    id: "next_year",
    title: "The year ahead",
    half: "fit",
    questions: [
      {
        id: "ongoing_conditions",
        kind: "multichoice",
        label: "Is anyone managing an ongoing health condition?",
        help: "Only what affects how often you need care and what it costs. Skip anything you would rather discuss with your agent.",
        options: [
          { value: "diabetes", label: "Diabetes" },
          { value: "heart", label: "Heart or blood pressure condition" },
          { value: "asthma", label: "Asthma or a breathing condition" },
          { value: "mental_health", label: "A mental health condition" },
          { value: "autoimmune", label: "An autoimmune condition" },
          { value: "cancer", label: "Cancer, now or recently" },
          { value: "other", label: "Something else" },
          { value: "none", label: "Nothing ongoing" },
        ],
        required: true,
        routing: "intake",
        rationale:
          "Every plan files a standard cost example for managing type 2 diabetes. The spread across New Jersey plans runs from $400 to $5,420, and it inverts the premium ranking.",
      },
      {
        id: "planned_care",
        kind: "multichoice",
        label: "Is anything planned for next year?",
        options: [
          { value: "surgery", label: "An operation or procedure" },
          { value: "baby", label: "Having a baby" },
          { value: "specialist", label: "Starting with a new specialist" },
          { value: "none", label: "Nothing planned" },
        ],
        required: true,
        routing: "intake",
      },
      {
        id: "time_out_of_state",
        kind: "multichoice",
        label: "Does anyone spend a lot of time outside New Jersey?",
        help: "This matters more than people expect.",
        options: [
          { value: "college", label: "A child at college in another state" },
          { value: "snowbird", label: "We spend part of the year elsewhere" },
          { value: "travel", label: "Frequent travel for work" },
          { value: "abroad", label: "Regular travel outside the country" },
          { value: "none", label: "No, we are here all year" },
        ],
        required: true,
        routing: "intake",
        rationale:
          "Every plan on the New Jersey marketplace is an EPO and none has a national network. Six of 39 carry no out of service area coverage at all, and 31 of 39 cover nothing outside the country.",
      },
    ],
  },

  {
    id: "preferences",
    title: "What matters to you",
    half: "fit",
    questions: [
      {
        id: "risk_appetite",
        kind: "choice",
        label: "If you had to pick one:",
        options: [
          {
            value: "low_premium",
            label: "Pay less every month, and accept a bigger bill if something goes wrong",
          },
          {
            value: "balanced",
            label: "Somewhere in the middle",
          },
          {
            value: "low_risk",
            label: "Pay more every month, so a bad year cannot hurt me badly",
          },
        ],
        required: true,
        routing: "intake",
        rationale:
          "Decides which of good, better or best to lead with. Without it the engine has to guess, and the honest answer is that this is a values question, not a maths question.",
      },
      {
        id: "budget_ceiling",
        kind: "currency",
        label: "Is there a monthly figure you cannot go above?",
        help: "Leave blank if there is not. This does not limit what we show you, it just tells your agent where the line is.",
        required: false,
        routing: "flag",
      },
      {
        id: "anything_else",
        kind: "longtext",
        label: "Anything else your agent should know before you meet?",
        help: "Anything at all. This goes straight to them.",
        required: false,
        routing: "flag",
      },
    ],
  },
];

/** Every question, flattened, in the order a client meets them. */
export function allQuestions(): Array<Question & { section: string; half: Section["half"] }> {
  return QUESTIONNAIRE.flatMap((s) =>
    s.questions.map((q) => ({ ...q, section: s.title, half: s.half })),
  );
}

/** Questions asked once per household member rather than once per household. */
export function perPersonQuestions(): Question[] {
  return allQuestions().filter((q) => q.perPerson);
}
