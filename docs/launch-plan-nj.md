# Launch plan: New Jersey

Written 10 August 2026, corrected the same day by Jon: launch does not wait
for open enrolment. Special enrolment runs year round, job loss, marriage,
divorce, birth, moves, aging off a parent's plan, each opening a 60 day
window, and the engine was built for it: the life events section exists for
exactly this, the conversion flags the special enrolment window and whether
it is still open, and pricing already scales to months of coverage
remaining. A special enrolment client today buys a 2026 plan, which is
precisely the data on disk and verified.

So launch means real special-enrolment prospects at beforewequote.com as
soon as the gates below clear, with the steady trickle of special enrolment
serving as a natural soft launch months before the open enrolment flood,
1 November 2026 to 31 January 2027 on GetCoveredNJ.

Explicitly out of scope here, at Jon's direction: the validation sessions with
Mike. They are tracked in [mike-session-runbook.md](mike-session-runbook.md)
and they remain the only thing that proves the engine's recommendations are
good. Everything below makes the product launchable; nothing below makes it
trustworthy. Do both.

## Gate 1: the server. Biggest build, no external dependency, start first

Stack decided by Jon on 10 August after the trade-off was laid out: **Vercel
hosting plus Supabase for both Postgres and logins**, one vendor and one
source of truth, with row-level security living inside the database. The
alternative (Neon plus Clerk, polished org screens at the cost of a
permanent sync seam) was considered and declined; revisit the login layer
only if enterprise polish becomes a sales requirement. Notifications ship
email-first; the 10DLC carrier registration for agent SMS starts now so
texts can follow without blocking anything. The engine stays in the browser
for v1: the server is storage, login and delivery, not a rebuild of the
brain.

Build order, each slice testable when done: submissions land server-side
with the code minted there; agent login and the submissions list; the
notification email; the agency table, subdomains and invites; the ops floor.
Then cutover: beforewequote.com points at the app and the localStorage era
ends.

Today the survey and the agent view talk through one browser's localStorage.
Launch requires the server work specified in
[handoff-2026-08-10.md](handoff-2026-08-10.md), all four decisions plus the
constraints:

- Submission endpoint and Postgres. The schema in src/store/schema.sql was
  written so this is a port, not a redesign, and db.ts says so in its header.
- Code minting server-side, per-agent intake addresses (wildcard subdomain
  routes the submission to its agency), rate limiting on the open write path.
- Agent login, bought from a hosted auth service, answering only "who is this
  and which brokerage". Whole-agency visibility. Scoping plus Postgres
  row-level security, never UI filtering.
- Agent dashboard: submissions list, open one, see the recommendation. Decide
  whether the engine runs server-side or stays in the browser fed by served
  data; either works, pick one deliberately.
- Notifications per Decision 3: SMS and email to the agent, client code and
  nothing else in the body. If SMS ships at launch, 10DLC registration takes
  weeks of carrier lead time and must start early.
- Operations floor: encrypted at rest, backups with a tested restore, error
  monitoring, audit logging. The memory rule: this data is pseudonymous, not
  anonymous, so it is guarded like it matters.

## Gate 2: the rebrand landed on the pages. Blocked on design, small to apply

- Client-facing pages become Before We Quote, agent-branded (Mike's name and
  face), product-silent. "Ask Mike" retired from everything a prospect sees.
- The "Testing arrangement" notice, the draft band, and every scaffolding
  element comes off the launch build.
- Real-device pass on phones. The form has a viewport meta and mobile
  breakpoints, so this is verification, not construction: prospects will fill
  this from a text link on a phone, so it must be excellent there, not merely
  functional.
- Accessibility basics (labels, contrast, keyboard path through the form) and
  one real-paper print of both agent sheets. Print CSS was fixed by
  emulation on 10 August; a physical printer confirms it.

## Gate 3: the questionnaire's honesty. CLEARED 10 August

Resolved the day it was written, on Jon's "fix gate 3". The correction to the
original claim first: health_system was never unread. It feeds
preferredHealthSystems, shows on the agent's household card, and rank.ts
raises a per-plan "network not yet verified against X" caveat from it. The
other four network questions and perceived_spend were genuinely unread, and
now are not:

- primary_care_doctor and specialists reach the agent verbatim on the
  household card as "Doctors to keep", the agent's checklist for a by-hand
  directory lookup, never parsed or matched, because the tool holds no
  provider directory and must not pretend to.
- network_priority shows beside the doctors in the client's own words, and
  the "must" answer raises a Before-you-quote flag: network fit decides that
  sale and the tool cannot verify networks.
- network_price shows as "their switching number", the client's own price for
  changing doctors, which is the number the agent negotiates against.
- perceived_spend joins the household facts as "their guess at last year's
  out of pocket", beside the computed estimates, which is what its own
  rationale always promised.
- All five now carry routing "flag" in the questionnaire, which is the
  taxonomy telling the truth: surfaced to the agent, not in the maths. The
  aspirational network_priority rationale was rewritten to describe what
  happens today. Nothing was cut.

Re-measured after: questions touching nothing fell from 12 to 8, flag-backed
questions rose to 11, and every remaining "touches nothing" entry is either
application plumbing or awaits copays. Wiring provider-directory data stays
out of launch scope, and the flag routing comment says not to promote these
to intake until it exists.

## Gate 4: plan year 2027 data. Gates the open enrolment season, not launch

Everything on disk is plan year 2026, which is correct for every special
enrolment sale through 31 December. The 2027 filings gate only the open
enrolment season. The NJ SBE publishes them in the fall; when they drop:

- Refresh the dataset, rebuild, and re-run the full verification suite:
  question-value, sensitivity, the dental audit (county limits and the
  three-child cap re-checked against 2027 rows), and the pediatric dental
  embed count, which is currently 24 of 176, all UnitedHealthcare, and may
  change.
- Re-verify every number that appears in user-facing copy. The copy rule:
  nothing prints that is not true of the loaded year.
- The two-decision timeline card already handles the year straddle.

## Legal and commercial wrap. Parallel track, needs humans

- Privacy policy and terms for the intake. No PII by design, but household
  health answers are sensitive even when pseudonymous. New Jersey's Data
  Privacy Act is in force; early volume is likely under its thresholds, but
  the policy gets written as if it applies, because the product's whole
  posture is that it would pass inspection.
- Mike confirms the agent-side rules: GetCoveredNJ agent conduct and
  marketing requirements, and that his E&O coverage is comfortable with
  tool-assisted recommendations. His compliance contact, not our guess.
- Domains: beforewequote.com nameservers delegated to Vercel, wildcard
  ready for per-agent subdomains. enrollasst.com stays parked until the
  broker site exists.

## The two clocks

Special enrolment launch, gated by Gates 1 to 3 plus legal, not by the
calendar:

- Server build, questionnaire decisions, rebrand applied as design delivers,
  legal wrap in parallel. Live on special enrolment traffic the moment they
  clear. Low steady volume, every case watchable, the 60 day window making
  the product's speed argument for it.

Open enrolment readiness, gated additionally by Gate 4:

- Fall: 2027 filings land, refresh and re-verify everything, including the
  dental facts and the embedded pediatric dental count.
- Mid-October: freeze. No risky changes after; near-all annual volume lands
  between 1 November and 31 January.

The validation sessions with Mike sit before both clocks, because a
launch-ready product running an unvalidated engine is a fast way to be
confidently wrong at scale. Special enrolment's trickle is also the natural
place for that validation to happen on real cases.
