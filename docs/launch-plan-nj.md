# Launch plan: New Jersey, plan year 2027

Written 10 August 2026. Launch means real prospects filling the survey at
beforewequote.com and real agent meetings running on the output, through open
enrolment, 1 November 2026 to 31 January 2027 on GetCoveredNJ.

Explicitly out of scope here, at Jon's direction: the validation sessions with
Mike. They are tracked in [mike-session-runbook.md](mike-session-runbook.md)
and they remain the only thing that proves the engine's recommendations are
good. Everything below makes the product launchable; nothing below makes it
trustworthy. Do both.

## Gate 1: the server. Biggest build, no external dependency, start first

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

## Gate 3: the questionnaire's honesty. Decide now, cheap to do

The measurement in scripts/question-value.ts found five network questions
(primary_care_doctor, specialists, network_priority, network_price,
health_system) that are collected and never read, and they are the questions
the product exists for. Launch cannot ship questions that are asked and
ignored; that breaks the project's own copy rule in spirit.

The pragmatic launch call to make: wire what has data, convert what the agent
can use into explicit flags, and cut what neither. Provider-directory data
(which doctors are in which network) is the expensive path and is not launch
scope. Also decide perceived_spend (read into the household, used nowhere)
and confirm visits_primary stays, since it starts mattering the moment copays
land in the cost model.

## Gate 4: plan year 2027 data. External, September to October

Everything on disk is plan year 2026. Open enrolment sells 2027 plans. The
NJ SBE publishes 2027 filings in the fall; when they drop:

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

## Working back from 1 November

- Now to September: server build, questionnaire decisions, rebrand applied
  as design delivers.
- September to mid-October: 2027 data lands, refresh and re-verify;
  device, accessibility and paper passes; legal wrap.
- Mid-October: freeze. No risky changes after; open enrolment seasonality is
  doctrine, near-all volume lands in the window.
- 1 November: live, with the validation sessions long since done, because a
  launch-ready product running an unvalidated engine is a fast way to be
  confidently wrong at scale.
