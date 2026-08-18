-- Training log schema. Every row is owned by a Supabase auth user and every
-- table carries user_id so row level security can be a single simple policy.

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  name text not null,
  type text not null check (type in ('W', 'R', 'T', 'WD', 'C', 'X')),
  position int not null default 0
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position int not null default 0,
  w numeric,
  r int,
  rpe numeric,
  t int,
  d numeric,
  raw text
);

create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('W', 'R', 'T', 'WD', 'C', 'X')),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.custom_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal text not null default 'muscle' check (goal in ('strength', 'muscle', 'endurance'))
);

create index if not exists workouts_user_date_idx on public.workouts (user_id, date desc);
create index if not exists exercises_workout_idx on public.exercises (workout_id, position);
create index if not exists exercises_user_name_idx on public.exercises (user_id, name);
create index if not exists sets_exercise_idx on public.sets (exercise_id, position);

alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.sets enable row level security;
alter table public.custom_exercises enable row level security;
alter table public.custom_workouts enable row level security;
alter table public.settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['workouts', 'exercises', 'sets', 'custom_exercises', 'custom_workouts', 'settings']
  loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;
