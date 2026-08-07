-- Storage for intake submissions, engine output, and what the agent actually did.
--
-- Three principles.
--
-- 1. Submissions and recommendation runs are immutable. They are never updated
--    in place, because "what did the client actually say" and "what did the
--    engine actually produce" are questions you want answered months later,
--    not overwritten by a correction.
--
-- 2. Every run records the version of everything that fed it. Without this you
--    cannot tell whether a bad recommendation was a bug, a stale plan file, or
--    one of the estimated service prices in assumptions.ts.
--
-- 3. agency_id is on every row from the first day, while there is exactly one
--    agency. Adding a tenant boundary later to a live system holding health
--    answers is genuinely horrible. Adding a column nobody reads yet is free.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agency (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'NJ',
  created_at  TEXT NOT NULL
);

-- Codes the agent hands to a client. Scoped per agency, so two agencies can
-- both issue K7M4QX without collision.
CREATE TABLE IF NOT EXISTS client_code (
  code        TEXT NOT NULL,
  agency_id   TEXT NOT NULL REFERENCES agency(id),
  label       TEXT,                      -- agent's own note, e.g. "Alvarez renewal"
  created_at  TEXT NOT NULL,
  consumed_at TEXT,                      -- set on submission; a code is single use
  PRIMARY KEY (code, agency_id)
);

-- Exactly what the client entered. answers is the raw payload keyed by
-- question id, stored verbatim so it can be replayed against a later engine.
CREATE TABLE IF NOT EXISTS submission (
  id                    TEXT PRIMARY KEY,
  agency_id             TEXT NOT NULL REFERENCES agency(id),
  client_code           TEXT NOT NULL,
  submitted_at          TEXT NOT NULL,
  questionnaire_version TEXT NOT NULL,
  answers               TEXT NOT NULL,   -- JSON
  is_synthetic          INTEGER NOT NULL DEFAULT 0,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS submission_agency_idx ON submission(agency_id, submitted_at);

-- One row per time the engine ran against a submission. Re-running after a
-- data refresh creates a new row rather than replacing the old one, which is
-- what makes "did the answer change, and why" answerable.
CREATE TABLE IF NOT EXISTS recommendation_run (
  id                    TEXT PRIMARY KEY,
  submission_id         TEXT NOT NULL REFERENCES submission(id),
  agency_id             TEXT NOT NULL REFERENCES agency(id),
  created_at            TEXT NOT NULL,
  plan_year             INTEGER NOT NULL,
  engine_version        TEXT NOT NULL,   -- hash of the cost, rank and subsidy code
  plan_data_version     TEXT NOT NULL,   -- hash of the PUF files it ran against
  assumptions_version   TEXT NOT NULL,   -- hash of assumptions.ts
  fpl_percentage        REAL,
  silver_variant        TEXT,
  federal_subsidy       REAL,
  plans_evaluated       INTEGER NOT NULL,
  plans_eligible        INTEGER NOT NULL,
  flags                 TEXT,            -- JSON array of agent facing warnings
  full_result           TEXT NOT NULL    -- JSON, every plan priced, not just the shortlist
);

CREATE INDEX IF NOT EXISTS run_submission_idx ON recommendation_run(submission_id, created_at);

-- The shortlist the agent was shown, one row per plan, in rank order.
CREATE TABLE IF NOT EXISTS shortlist_entry (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES recommendation_run(id),
  rank              INTEGER NOT NULL,
  tier              TEXT NOT NULL,       -- good, better, best
  plan_id           TEXT NOT NULL,
  issuer_name       TEXT NOT NULL,
  marketing_name    TEXT NOT NULL,
  metal_level       TEXT NOT NULL,
  annual_premium    REAL NOT NULL,
  expected_oop      REAL NOT NULL,
  expected_total    REAL NOT NULL,
  worst_case_total  REAL NOT NULL,
  rationale         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS shortlist_run_idx ON shortlist_entry(run_id, rank);

-- What the agent actually did with it. This is the performance signal. If the
-- engine's top pick is silently dropped most of the time, that is the single
-- most valuable fact in the database and nothing else captures it.
CREATE TABLE IF NOT EXISTS agent_review (
  id                     TEXT PRIMARY KEY,
  run_id                 TEXT NOT NULL REFERENCES recommendation_run(id),
  agency_id              TEXT NOT NULL REFERENCES agency(id),
  agent_name             TEXT NOT NULL,
  reviewed_at            TEXT NOT NULL,
  presented_plan_ids     TEXT NOT NULL,  -- JSON array, what actually went on paper
  recommended_plan_id    TEXT,           -- what the agent led with
  followed_engine        INTEGER,        -- 1 when the agent led with the engine's top pick
  override_reason        TEXT,           -- free text, the most useful column here
  time_spent_minutes     INTEGER
);

CREATE INDEX IF NOT EXISTS review_run_idx ON agent_review(run_id);

-- What the client chose, and eventually what it cost them. Closing this loop
-- is the only true accuracy measure available.
CREATE TABLE IF NOT EXISTS outcome (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES recommendation_run(id),
  agency_id           TEXT NOT NULL REFERENCES agency(id),
  recorded_at         TEXT NOT NULL,
  enrolled_plan_id    TEXT,
  enrolled            INTEGER NOT NULL DEFAULT 0,
  actual_annual_spend REAL,              -- filled in the following year
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS outcome_run_idx ON outcome(run_id);
