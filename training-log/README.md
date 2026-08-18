# Training Log

The artifact build, moved onto Next.js, Supabase and Vercel. Same app: log every
set, see what you did last time on the line above the inputs, get told what to do
next when RPE misses the target.

## Why it moved

Artifact storage does not follow the code between threads, so the history was one
lost thread away from gone. Postgres holds it now, the phone is just a client, and
everything can leave as CSV.

## Setup

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor. It creates the six
   tables, the indexes and one row level security policy per table, so every row
   is readable only by the user that owns it.
3. In Authentication then URL Configuration, add `https://YOUR-DOMAIN/auth/callback`
   as a redirect URL. Sign in is a magic link, no password.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
5. `npm install` then `npm run dev`.

Deploying to Vercel: import the repo, set the root directory to `training-log`,
add the same two environment variables, done.

## Bringing the artifact history over

Open the v4 artifact, read `training-data-v2` out of `window.storage`, copy the
JSON. In this app, Settings then paste it into the import box. The importer takes
the v2 shape and the v1 `workout-log` shape, parses old string sets like
`135x8 @8` and `20:00 2.1mi` back into fields, and mints fresh uuids because
Postgres wants uuids and the artifact did not use them.

## Layout

    app/                  routes, the auth gate and the magic link callback
    components/App.tsx    tabs, state, the debounced writer
    components/           editor, exercise block, set row, picker, builder, sheets
    lib/exercises.ts      223 movements across 14 muscle groups, each typed
    lib/templates.ts      6 splits, 24 days
    lib/coach.ts          goal ranges and the RPE response
    lib/importer.ts       artifact v1 and v2 blobs in
    lib/csv.ts            one row per set out
    lib/db.ts             every read and write
    supabase/migrations/  schema and row level security

## Set types

    W   weight and reps, optional RPE
    R   reps only, optional RPE
    T   time
    WD  weight and distance in feet
    C   cardio, time and optional miles

## Writes

Edits land in React state immediately and reach Postgres 700ms later, so typing a
set never waits on the network. A workout saves whole: upsert the workout row,
replace its exercises and sets. Pending writes flush when the tab is hidden.

## Checks

`npm run check` covers the library, the templates, the coach, the importer and the
CSV export. `npm run build` type checks the whole app.

## Not built yet

Rest timer, progression charts, superset grouping, exercise reordering, PR
detection, the 3 week effort wave as a cycle tracker.
