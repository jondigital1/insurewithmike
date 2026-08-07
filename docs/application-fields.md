# The application fields, and where each one belongs

## Sources

- **NJ single streamlined application**, `Application for Health Coverage & Help Paying Costs`, form NJFC-APP-E-0724, 17 pages. This is the New Jersey version and it covers both NJ FamilyCare and the marketplace.
- **Federal marketplace application**, CMS `marketplace-application-for-family.pdf`, 14 pages, and the individual short form.

Both derive from the same federally prescribed template and the field sets are near identical.

**Caveat worth stating plainly.** GetCoveredNJ's own application is online only, so the
authoritative field list for the screen Mike actually fills in has not been captured.
These two documents are the same application in paper form and will be close, but the
online flow adds conditional branches that paper cannot express. Confirm against a
recording of Mike working through a real enrolment before treating this as final.

## The finding that matters most

The application and the recommendation need almost entirely different information.

The application establishes **who you are, whether you are eligible, and what you pay**.
Every question on it serves identity, household composition, immigration status, income
or existing coverage.

It asks **nothing at all** about which doctors you see, which hospital system you use,
what prescriptions you take, how often you went to the doctor last year, or what any of
it cost you. Not one question.

So the intake form has two halves that do not overlap:

| | Comes from | Purpose |
|---|---|---|
| Eligibility half | Mirrors the application | Subsidy, cost sharing tier, who can enrol |
| Fit half | Exists nowhere in the application | Which of the eligible plans is right |

Mike's three to four hours covers both halves in one sitting. Only the second half is
his expertise. The first half is transcription.

## Routing

Each field is tagged for where it should live under the no-PII design.

- **CRM** identifying, stays in the Prudential system, never enters ours
- **INTAKE** client answers in our system, not identifying on its own
- **AGENT** the agent supplies it
- **SKIP** not needed for anything we do

### Step 1, contact information

| Field | Route | Note |
|---|---|---|
| First, middle, last name, suffix | CRM | |
| Home address, apartment, city, state, ZIP | CRM | |
| **County** | INTAKE | Needed. Gates plan availability. Ambetter sells in only 17 of 21 counties. Not identifying on its own. |
| Mailing address if different | CRM | |
| Home, cell, other phone, text permission | CRM | |
| Email address | CRM | |
| Preferred spoken and written language | CRM | Affects service delivery, not plan choice |

### Step 2, one block per person

| Field | Route | Note |
|---|---|---|
| Name, suffix | CRM | |
| Relationship to person 1 | INTAKE | Needed. Builds the household and the tax household. |
| Married | INTAKE | Needed. Joint filing is a condition of the credit for married couples. |
| Date of birth | CRM, **age to INTAKE** | Store the age, never the birth date. Age alone drives the premium. |
| Sex | CRM | Required on the application. Irrelevant to pricing, since gender rating is prohibited. |
| Social Security number | CRM | Never enters our system under any circumstance. |
| Plans to file a federal return next year | INTAKE | Needed. No return, no premium tax credit. |
| Filing jointly, spouse name | INTAKE, name to CRM | Flag only |
| Claiming dependents, dependent names | INTAKE, names to CRM | Count only |
| Will be claimed as a dependent | INTAKE | Changes whose household they belong to |
| **Pregnant, number expected, due date** | INTAKE | Needed twice over: a Medicaid pathway, and the single largest predictable utilisation event there is. |
| Needs health coverage | INTAKE | Determines who is actually enrolling versus who is only counted |
| **Physical, mental or emotional condition causing limitations** | INTAKE | Strong utilisation signal and a Medicaid pathway |
| Citizen, naturalised, immigration status and document numbers | CRM | Eligibility gate, and directly identifying |
| Lived in the US since 1996 | CRM | |
| Veteran or active duty, self, spouse or parent | INTAKE | Alternative coverage worth surfacing |
| Help paying medical bills from the last 3 months | SKIP | Medicaid retroactive coverage, not our concern |
| Lives with a child under 19 and is the main carer | INTAKE | Medicaid pathway |
| Full time student | INTAKE | |
| **In foster care at 18 or older** | INTAKE | Needed. Opens a free coverage pathway to 26 that is very easy to miss. |
| Race, ethnicity | SKIP | Optional on the form and explicitly does not affect eligibility |

### Step 2, income, one block per person

| Field | Route | Note |
|---|---|---|
| Employed, not employed, self employed | INTAKE | |
| Employer name, address, phone | CRM | The client said income but not the actual job, and this is the line |
| **Wages before tax, and frequency** | INTAKE | Needed. Drives everything downstream. |
| Average hours worked per week | INTAKE | Feeds the employer coverage question |
| Changed jobs, stopped working, fewer hours in the past year | INTAKE | Volatility warning. Matters enormously near the 400 percent cliff. |
| Self employment type of work | CRM | |
| **Self employment net income this month** | INTAKE | |
| Other income: unemployment, pension, Social Security, retirement accounts, alimony received, farming or fishing, rental or royalty, other | INTAKE | All of it. This is modified adjusted gross income. |
| **Deductions: alimony paid, student loan interest, other** | INTAKE | Needed. Deductions lower MAGI, which raises the subsidy. Routinely forgotten. |
| Total income this year, total next year, hard to predict | INTAKE | The subsidy is computed on projected income, not last year's |

### Step 3, existing coverage

| Field | Route | Note |
|---|---|---|
| Currently enrolled in Medicaid, NJ FamilyCare, Medicare, TRICARE, VA, Peace Corps, employer or other | INTAKE | |
| Name of insurer, policy number | Insurer to INTAKE, policy number to CRM | The insurer and plan name give us the renewal baseline |
| Is it COBRA, is it a retiree plan | INTAKE | |
| **Is anyone offered health coverage from a job** | INTAKE | See below. This one question can invalidate the entire recommendation. |

### Appendix A, employer coverage detail

Triggered whenever anyone is offered coverage through any job, including a spouse's or
a parent's.

| Field | Route |
|---|---|
| Employee name, SSN, employer name, EIN, address, phone, contact | CRM |
| Eligible now, or waiting period end date | INTAKE |
| Does the plan meet the minimum value standard | INTAKE |
| **Employee only premium, and how often** | INTAKE |
| Any change for the new plan year, new premium, date of change | INTAKE |

### Appendix B, American Indian or Alaska Native

| Field | Route | Note |
|---|---|---|
| **Member of a federally recognised tribe** | INTAKE | Unlocks the zero and limited cost sharing plan variants. The engine currently excludes 74 variants on this basis. |
| Has received or is eligible for Indian Health Service care | INTAKE | |
| Income from tribal sources | INTAKE | Excluded from the income count |

## Four questions that change the entire answer

These are buried in the application as ordinary checkboxes. Each one can invalidate a
recommendation that is otherwise correct, and the intake form must ask all four early
rather than late.

1. **Is anyone offered coverage through a job?** If an employer offers coverage that
   meets the minimum value standard and is affordable, the household is barred from the
   premium tax credit entirely. Every net premium we compute would be wrong, usually by
   ten thousand dollars or more. This is the single most dangerous field on the form.

2. **What is the income relative to the poverty level?** Below roughly 138 percent in
   New Jersey, the household belongs in NJ FamilyCare and not in the marketplace at all.
   The engine should detect this and route rather than recommend.

3. **Is anyone a member of a federally recognised tribe?** This unlocks the zero and
   limited cost sharing variants, which are richer than anything else on the market.

4. **Was anyone in foster care at 18 or older?** A coverage pathway to age 26 that is
   easy to miss and free.

Alongside those: **is the income likely to change?** The 400 percent cliff returned for
2026. A household that projects 395 percent and finishes the year at 405 percent repays
the entire credit. The form asks this and the intake form must too.

## What the application never asks, which is our actual job

None of the following appears anywhere on either application. All of it is what Mike
currently extracts by interview, and all of it is what decides which eligible plan is
the right one.

- Which primary care doctor and which specialists they see, by name
- Which hospital system they use, meaning Penn, Jefferson, Inspira and the rest
- Whether they would change doctors to save money, and how much it would take
- Prescriptions, by name and dose
- Visits last year by type: primary care, specialist, urgent care, emergency, therapy,
  physical therapy, imaging, procedures
- What they believe they spent out of pocket
- Planned care for the coming year, such as a knee replacement or a baby
- Ongoing therapy or physical therapy, which runs into the filed 30 visit annual caps
- Whether anyone travels, winters elsewhere, or has a child at college out of state.
  Every New Jersey plan is an EPO, none has a national network, and six of 39 carry no
  out of service area coverage at all.
- Appetite for risk, meaning a low premium with high exposure against the reverse

## Consequence for the build

The eligibility half is long, tedious and almost entirely mechanical. It is also the
part that has to be keyed into GetCoveredNJ afterwards, so capturing it in our own
structured form turns Mike's interview into a transcription job he can do quickly, or
eventually not at all once there is an integration.

The fit half is short, and it is the only part that requires judgement to interpret.

Both halves belong in the client facing form. Only the second half is interesting.
