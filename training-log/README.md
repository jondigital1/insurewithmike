# Training Log

The artifact build, moved onto Next.js, Supabase and Vercel. Same app: log every
set, see what you did last time on the line above the inputs, get told what to do
next when RPE misses the target.

## Why it moved

Artifact storage does not follow the code between threads, so the history was one
lost thread away from gone. Postgres holds it now, the phone is just a client, and
everything can leave as CSV.

## Help

A built-in knowledge base behind the ? in the header and a row in Settings: 45
answers across the basics (supersets, drop sets, RPE, soreness, failure), getting
stronger (double progression, increment sizes, plateaus, deloads), the app
itself, and what its numbers mean. Search is local scoring over authored text
and nothing else: a question the base cannot answer says so plainly instead of
guessing, and nothing ever searches the internet. Nutrition, supplements and
pain are answered with an honest gate rather than silence. lib/knowledge.ts is
the content, sourced from the beginner questions people actually ask.

## Appearance

Light and dark, from one token set. The app follows the device by default, pure
CSS, and Settings carries a System / Light / Dark choice that beats the device
and survives reload without a flash. The accent darkens in light mode so small
accent text keeps its contrast on white.

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
    lib/exercises.ts      226 movements across 14 muscle groups, each typed
    lib/onboarding.ts     the questions, the scoring, the split table, the swaps
    lib/gamify.ts         records, beat the ghost, coverage, the grid, the streak
    lib/wave.ts           the three week effort cycle and what it asks of a set
    lib/rest.ts           when a set counts as done and how long it earns
    lib/superset.ts       which consecutive exercises run together
    lib/progress.ts       one point per movement per day, and what to measure
    lib/order.ts          hardest first, and moving things by hand
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

Edits land in React state immediately and reach Postgres a beat later, so typing
a set never waits on the network. A workout saves whole in one save_workout call.

A failed save is never dropped. The queue holds it, retries with backoff, and
flushes again the moment the connection returns. Everything unsaved is also
mirrored to the device, keyed per user and per tab, so a tab that dies offline
replays its work on the next open. Deletes ride the same queue. A dead
connection gets a reassuring banner; a real rejection shows its message. What
does not exist yet is offline boot: reloading with no network still cannot
load the app itself.

## Checks

`npm run check` covers the library, the templates, the coach, the importer and the
CSV export. `npm run build` type checks the whole app.

## Onboarding

First open asks two health questions and four real ones, then hands over a
session. The answers pick a split from the 24 template days, decide how many
movements fit the time available, swap movements around sore joints, filter to
the equipment on hand, and keep the RPE box hidden until the number would mean
something. Everything is skippable and skipping lands on Full Body three days a
week.

Tier 2 questions arrive later, in context: how long you have got at the first
session start, sore joints on a visit after a session is behind you, everything
else in Settings. Four weeks in, if the last four weeks ran thin, the app offers
the shorter plan exactly once: either answer is final, and the sore joints
question is a quiet card on the log tab rather than anything that blocks a tap.

`docs/onboarding-research.md` is the evidence and the tables.
`docs/onboarding-prototype.html` is the clickable version of every screen.
`lib/onboarding.ts` is the implementation.

## What the log gives back

PRs fire on four things and are flagged on the set as you type it: heaviest
load, most reps at that load or heavier, best estimated max (Epley, so 80 x 9
beats 80 x 8 without touching the plates), and best session volume for that
movement. A grindy single does not count as a record unless strength is the
stated goal.

Beat the ghost: a set that clears the same numbered set from last session gets a
quiet mark. Different bar to a PR, and it fires far more often.

History carries the last 28 days as a dot per day and the week streak, counted in
weeks that met the days you said rather than consecutive days, so a rest day
costs nothing. Under it, sets per muscle group this week against the 10 set
target, which is the only number here that tells you what to do differently.

## Order

Sessions generated from the plan come out hardest first: multi joint before
single joint, big muscle before small, and heavier before lighter judged on this
person's own logged numbers. A day picked by name from the templates, or built by
hand, keeps the order it was written in: ordering with intent is not a mistake to
correct, so the app neither re-sorts it nor offers to.

Arrows on each exercise move it by hand, and a superset moves as one thing. On
generated sessions only, pushing something genuinely out of order surfaces an
offer to put the hardest back at the front.

## Progression charts

A third tab. One chart per movement, never two movements on one axis: a leg press
and a lateral raise sharing a scale says nothing true. Weighted work is charted on
the estimated max, so a rep added at the same load shows up as progress, and
everything else on the thing it is measured in.

Each chart carries the current number, the change since the first session, a
crosshair you can drag along to read any session, and a Numbers toggle that opens
the same data as a table. A movement needs two sessions before it gets a line. The
top three by frequency show by default, which surfaces the numbers somebody
actually tracks without asking which they are.

## Supersets

The picker and the workout builder both carry a Superset toggle. Turn it on and
everything you pick joins the same group until you turn it off, so two taps and
two movements is a superset. Saved workouts keep their groups. Templates can
carry them too: the core circuit in the summer and five day splits is one, and
the session time cap treats a group as atomic, whole or absent, never sliced.
In a session, a Link button between any two neighbouring blocks joins them, and
Unlink puts them back. Supersets render as one block, labelled A1 and A2, and
the rest timer waits for the last movement in the group rather than firing
between them, which is the only thing about a superset the app actually has to
understand.

A superset is a tag shared by consecutive exercises, not a table. Order on screen
is the order they run in, so the same tag either side of a gap is two supersets,
and a tagged movement on its own is just a movement.

## Rest timer

Starts itself the moment a set becomes a set, which is the moment you want it,
and not before: a load with no reps beside it is half a set and starts nothing.
The suggested length comes from the movement and the goal, longer for the big
lifts, shorter for the arms and calves, none at all for cardio. There is a manual
button on every exercise for the times it guesses wrong.

The bar counts to an end timestamp rather than ticking a number down, so locking
the phone or reloading the page gives back the right number. It buzzes and beeps
once at zero. Editing a past session never starts anything.

## The effort wave

Optional, off by default, switched on in Settings. Three weeks on repeat: build
at two in reserve, push at one, then a week that goes to the end. The card on the
Log tab says which week you are in and reads back the average RPE you have
actually logged this week against it.

It is not decoration. While the wave is running the coach line takes its RPE band
from the week rather than the goal, so RPE 9 says nothing in a push week and
"over target, hold the load, drop a rep" in a build week. Only appears once the
RPE box does, since a target you cannot aim at is noise.

## All time

Total lifted, sessions and sets, each with the next round number to chase, plus
reps and time under holds. The only numbers here that never go down, which is
what makes them worth having on a bad week.

## Not built yet

Everything on the original backlog is built. Next up is the deploy: the schema,
the two functions and the four migrations have never run against real Postgres.
