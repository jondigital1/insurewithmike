# Legal and compliance research: New Jersey launch

Researched 10 August 2026 by four independent research passes (privacy law,
marketplace and producer rules, professional liability, website obligations)
with a fifth adversarial pass that checked every load-bearing claim against
primary sources: statute text, regulator pages, court opinions, FTC orders.
Every checked claim was CONFIRMED; corrections and nuances the checker found
are folded in below. This is research to brief a lawyer with, not legal
advice, and the counsel questions at the end are the point of the exercise.

## The headline: the product's design is the legally correct pattern

Four independent bodies of law each validate a choice this product already
made:

1. **Agent-only recommendations sit on the right side of the licensing
   line.** NJ reserves "conferring directly with or offering advice directly
   to a purchaser" about a particular policy's benefits to licensees
   (N.J.S.A. 17:22A-28), and N.J.A.C. 11:17A-1.2 carves out clerical work
   (taking applications, receiving information) for unlicensed persons. A
   tool that collects answers and shows the shortlist only to the licensed
   agent stays inside the carve-out. Software showing recommendations to
   consumers would flirt with unlicensed "negotiating" or "insurance
   consultant" activity.
2. **Intake-only keeps EnrollAsst out of the web-broker regime.** The
   federal definition (45 CFR 155.20, 155.220) turns on hosting a site that
   interfaces with an exchange to complete plan selection. GetCoveredNJ is a
   standalone state exchange with no direct-enrollment channel at all, so the
   guardrails are: never display plan comparisons to consumers, never
   connect to GetCoveredNJ, never complete an application. Enrolment always
   happens in the state broker portal, by the certified agent.
3. **No-PII pays off in breach law.** NJ breach notification (N.J.S.A.
   56:8-161 et seq.) keys on name plus SSN, license, account numbers, or
   login credentials. The consumer survey store contains none of those, so
   its breach likely triggers no consumer notification. The one in-scope
   dataset is agent emails and passwords, which makes agent authentication
   the highest-sensitivity surface in the product.
4. **Verbatim stored answers are the liability defense.** NJ producers carry
   a fiduciary duty (Aden v. Fortsh, 2001) and a heightened duty when
   conduct invites reliance (Sobotor, Triarsi); the shield is proof the
   agent acted on the client's own stated needs (Duffy, 2014). The tool's
   verbatim answer record is exactly that proof, and it also rebuts the
   steering theory in DOJ's 2025 False Claims Act case against carriers and
   brokerages (a Medicare Advantage case, but the clearest signal of where
   regulators think broker suitability duties sit).

## What the law says we must add. All buildable, none optional

1. **A clickwrap at intake start** (NJ enforces clickwrap, Caspi v.
   Microsoft, 1999; browsewrap is unreliable). One affirmative act before
   question one, recorded against the claim code with timestamp, covering:
   I am 18 or older; consent to electronic records (NJ UETA / E-SIGN); this
   site collects information for your licensed agent and gives no advice,
   no recommendation, no offer of coverage; the agent identified by name.
2. **A standalone health-data opt-in before the health questions.** The
   NJ Data Privacy Act treats health condition, treatment and diagnosis
   answers as sensitive data requiring unbundled opt-in consent. Volume
   thresholds (100,000 NJ consumers) mean the act likely does not bind at
   launch, but the consent step costs nothing, future-proofs scale, and is a
   brokerage selling point. Crucial nuance the checker confirmed: NJ has NO
   pseudonymous-data carve-out. Coded answers joinable through the agent's
   CRM are fully regulated personal data. The word "anonymous" must never
   appear in any copy; the true sentence is "we do not ask for your name,
   date of birth, contact information, or Social Security number."
3. **Producer identification on every agent subdomain** (N.J.A.C.
   11:17A-2.6): the agent's name exactly as licensed, agency name, the
   relationship represented, NPN, and a link to the state license lookup.
   The intake site is producer advertising under N.J.A.C. 11:2-11 (which
   explicitly covers internet material), so consumer-facing copy makes no
   benefit, premium or savings claims about particular plans and never
   implies state endorsement.
4. **A notice of insurance information practices** under the NJ Insurance
   Information Practices Act (N.J.S.A. 17:23A-4), templated per agent and
   shown or linked at intake. This 1985 insurance-specific statute applies
   to agents NOW, regardless of any privacy-law threshold, and DOBI Bulletin
   01-10 means an agent collecting data through his own tool cannot lean on
   a carrier's notice. Contents: what is collected and how, disclosure
   circumstances, access and correction rights, the insurance-support
   organization retention statement. Penalties run to license suspension.
5. **A privacy policy that matches the code exactly.** Seven NJDPA notice
   elements, the 17:23A layer, an express "no sale of personal data, no
   targeted advertising, no consumer profiling" statement, and a
   description of the localStorage draft. The FTC's GoodRx and BetterHelp
   cases were built on privacy promises operations contradicted, and
   BetterHelp specifically involved intake questionnaire answers. This
   product's existing copy-must-be-true rule is literally the compliance
   strategy.
6. **WCAG 2.1 AA accessibility, native, no overlay widgets.** 2025 set a
   record for web accessibility suits (3,117 federal, 5,000+ with state
   courts), forms are DOJ's named barrier category, and roughly a quarter
   of sued sites had an overlay widget installed when the complaint
   arrived. Build the intake accessible (labels, keyboard, contrast, focus,
   announced errors), test with a screen reader each release, publish an
   accessibility statement with a working contact.
7. **Tracker-free health pages, permanently.** No analytics, pixels,
   session replay, third-party chat or fonts on any page touching health
   answers. This is the FTC enforcement line (GoodRx $1.5M, BetterHelp
   $7.8M, Premom, Monument, Cerebral) and the wiretap class-action wave.
   The current design already complies; the brokerage contract must forbid
   customers injecting their own trackers into their subdomains.
8. **An agent adoption flow with an audit trail.** The agent opens,
   reviews, and affirmatively adopts (or overrides with a reason) before
   anything reaches the client. This single feature preserves the agent's
   E&O coverage (underwriters now ask how reliance on tools is validated,
   and AI exclusions are being filed into E&O lines by AIG, W.R. Berkley
   and Great American, with an ISO generative-AI exclusion effective
   January 2026), keeps the vendor in the decision-support role, and
   creates the record that wins the liability cases above. Freeze the data
   vintage the agent saw, make the record exportable with the claim code
   and a content hash, retain 7 to 10 years.
9. **Vendor terms on the market pattern.** Decision-support only, as-is
   data accuracy disclaimer, agent duty to verify with carrier or exchange,
   liability capped at 12 months of fees (HealthSherpa caps at $100;
   a fees cap is more defensible), consequential damages excluded, agent
   indemnity. Brokerage contracts carry NJDPA processor terms and
   GetCoveredNJ privacy flow-down (45 CFR 155.260(b) obliges the exchange
   to bind brokers and their downstream vendors to its privacy standards).

## The watch list

- **A5328, signed 30 June 2026:** new NJ law banning the SALE of sensitive
  data regardless of thresholds, with a data broker registry from March
  2027. We never sell data, so this confirms posture rather than changing
  it, but it shows NJ privacy law is moving; monitor.
- **NJDPA regulations:** the June 2025 proposed rules expired unadopted in
  June 2026; the statute stands alone and the mandatory cure period ended
  1 July 2026. A re-proposal could revive strict de-identification
  positions.
- **The 100,000-consumer threshold:** EnrollAsst using survey data for its
  own purposes (analytics, tuning) would make it a controller counting all
  brokerages' consumers combined. That is the realistic path into NJDPA
  scope, and the consent and policy work above means crossing it is a
  non-event.
- **FTC Health Breach Notification Rule:** probably does not reach a tool
  managed for the agent rather than the individual, but the 2024 revision
  is broad and the FTC is aggressive. Design as if it applies; document the
  position that it does not.
- **E&O AI exclusions:** every agent renewal from here on should be checked
  for newly attached AI or technology exclusions.

## Questions for a NJ insurance lawyer, consolidated

1. Is EnrollAsst an "insurance-support organization" under N.J.S.A.
   17:23A-2, and does the 17:23A-4 notice duty fall on the agent, the
   vendor, or both? (The definition plausibly covers a survey vendor; no
   authority applies it to SaaS intake.)
2. Does a licensed producer or brokerage qualify for the NJDPA GLBA
   financial-institution exemption, and is intake data in the vendor's
   hands exempt "data subject to Title V"?
3. Is EnrollAsst a "vendor of personal health records" under the revised
   16 CFR 318.2?
4. Review the signed GetCoveredNJ Broker Acknowledgment (not public) for
   conduct, marketing, or data terms reaching third-party tools, and the
   final consumer copy against N.J.A.C. 11:2-11.
5. Are the liability cap and indemnity enforceable against NJ brokerages as
   drafted, and does anything in the tool's operation constitute unlicensed
   production under N.J.S.A. 17:22A?
6. Does the NJ Law Against Discrimination reach an agent's intake site
   independent of the federal physical-nexus limit?

## Mike's personal list

- Pull his signed GetCoveredNJ Broker Acknowledgment for the lawyer.
- Confirm his E&O policy's professional-services definition covers
  individual marketplace health sales, and ask at renewal about AI or
  technology exclusions; keep a one-page description of the tool-assisted
  workflow with human review for underwriters.
- Keep certification current each year: NJ producer license, annual
  GetCoveredNJ training before open enrolment, Broker Acknowledgment. When
  EnrollAsst signs other brokerages, this becomes an onboarding checkbox.
- No gifts or incentives to consumers for completing the intake (N.J.A.C.
  11:17A-2.3).

## Verification notes

Every load-bearing claim above was checked against primary sources and
confirmed. Nuances the checker surfaced, kept for honesty: the DOJ False
Claims Act case is about Medicare Advantage, not marketplace plans, so it
is directional sentiment rather than binding doctrine here; the
special-relationship factor list in the cited commentary does not itself
name website advice promises as a factor (that is inference, though sound);
California's web-accessibility volume is state-court, not federal; the Big
I seven-year retention figure and the CMS "typed signatures insufficient"
wording were plausible but not directly opened; and one research pass
caught its own tool fabricating a DOBI bulletin summary and corrected it by
reading the bulletin directly, which is why the adversarial pass exists.

Full lane-by-lane findings with citations live in the workflow output; the
key statutes: N.J.S.A. 56:8-166.4 et seq. (NJDPA), N.J.S.A. 17:23A
(insurance information practices), N.J.S.A. 17:22A-28 (producer licensing),
N.J.A.C. 11:2-11 and 11:17A (advertising and conduct), 45 CFR 155.220 and
155.260 (exchange rules), 16 CFR Part 318 (FTC health breach rule),
N.J.S.A. 12A:12 (UETA).
