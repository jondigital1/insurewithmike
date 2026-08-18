-- What onboarding learns about a person. One row per user, alongside the goal
-- the settings table already holds. jsonb rather than a column per answer
-- because the tier 2 questions are still moving and none of this is queried
-- across users.

alter table public.settings
  add column if not exists profile jsonb not null default '{}'::jsonb,
  add column if not exists onboarded_at timestamptz;
