// Plain assertions over the pure logic: library, templates, coaching, the
// artifact importer and CSV export. Run with npm run check.
import assert from 'node:assert/strict'
import { LIBRARY, MUSCLE_GROUPS, lookupType } from '../lib/exercises'
import { SPLITS, dayItems, dayNames } from '../lib/templates'
import { coach, roundLoad } from '../lib/coach'
import { fmtSet, fmtTime, parseClock, topSet } from '../lib/format'
import { importArtifactData, parseSetString } from '../lib/importer'
import { toCsv } from '../lib/csv'
import { buildDay, dayById, experienceScore, level, needsCheckin, planFor } from '../lib/onboarding'
import { equipmentOf } from '../lib/exercises'
import {
  beatsLast, bestsFor, e1rm, LADDERS, lifetime, nextLandmark, prsFor, trainingGrid, volumePr,
  weeklyCoverage, weeklyStreak, weekStart,
} from '../lib/gamify'
import { mondayOf, readWave, WAVE, waveWeek } from '../lib/wave'
import { isCompound, isFullSet, restFor } from '../lib/rest'
import { groupRuns, isSuperset, supersetLetter, supersetRest } from '../lib/superset'
import { KNOWLEDGE, KNOWLEDGE_GROUPS, searchKnowledge } from '../lib/knowledge'
import { seriesFor, trackedNames } from '../lib/progress'
import { groupSize, hardestFirst, isHardestFirst, moveRun, topLoads } from '../lib/order'
import type { Exercise } from '../lib/types'
import type { Workout } from '../lib/types'

let checks = 0
function check(name: string, fn: () => void) {
  fn()
  checks += 1
  console.log('ok', name)
}

check('library has 14 groups and 200 plus movements', () => {
  assert.equal(MUSCLE_GROUPS.length, 14)
  assert.ok(LIBRARY.length > 200, `only ${LIBRARY.length}`)
  assert.equal(new Set(LIBRARY.map((e) => e.name)).size, LIBRARY.length)
})

check('six splits, twenty four days, every movement is in the library', () => {
  assert.equal(SPLITS.length, 6)
  assert.equal(
    SPLITS.reduce((n, s) => n + s.days.length, 0),
    24,
  )
  for (const split of SPLITS) {
    for (const day of split.days) {
      for (const item of dayItems(day)) assert.ok(lookupType(item.name), `${item.name} missing`)
    }
  }
})

check('his splits carry the core circuit and no barbell squat or deadlift', () => {
  const banned = ['Back Squat', 'Front Squat', 'Deadlift', 'Romanian Deadlift', 'Good Morning']
  for (const id of ['summer4', 'five']) {
    const split = SPLITS.find((s) => s.id === id)!
    for (const day of split.days) {
      const names = dayNames(day)
      assert.ok(names.includes('Plank'), `${day.name} has no core circuit`)
      assert.ok(names.includes('Hanging Leg Raise'), `${day.name} has no core circuit`)
      for (const bad of banned) assert.ok(!names.includes(bad), `${day.name} has ${bad}`)
    }
  }
})

check('the core circuit is one superset in his template days', () => {
  for (const id of ['summer4', 'five']) {
    const split = SPLITS.find((s) => s.id === id)!
    for (const day of split.days) {
      const items = dayItems(day)
      const circuit = items.filter((i) => i.superset)
      assert.equal(circuit.length, 4, `${day.name} circuit is ${circuit.length} movements`)
      assert.equal(new Set(circuit.map((i) => i.superset)).size, 1, `${day.name} circuit split across tags`)
      const tail = items.slice(-4)
      assert.ok(tail.every((i) => i.superset), `${day.name} circuit is not at the end`)
    }
  }
  // days without a circuit stay untagged
  const bro = dayItems(dayById('bro-chest')!)
  assert.ok(bro.every((i) => !i.superset))
})

check('a swap inside the circuit keeps the superset tag', () => {
  // Ab Wheel Rollout swaps for a wrist, Cable Crunch for nothing here; use a
  // fake day so the swap machinery is exercised inside a tagged group.
  const day = { id: 'fake', name: 'Fake', exercises: [['Back Squat', 'Cable Curl']] as (string | string[])[] }
  const items = buildDay(day as never, { sore: ['Knee'] })
  assert.equal(items.length, 2)
  assert.ok(items.every((i) => i.superset === items[0].superset && i.superset), 'tag lost in the swap')
  assert.equal(items[0].name, 'Leg Press')
  assert.equal(items[0].swappedFrom, 'Back Squat')
})

check('coach reacts to RPE against the goal', () => {
  assert.match(coach({ id: '1', w: 135, r: 8, rpe: 10 }, 'W', 'muscle')!, /drop to 7/)
  assert.match(coach({ id: '1', w: 135, r: 6, rpe: 10 }, 'W', 'muscle')!, /125/)
  assert.match(coach({ id: '1', w: 95, r: 12, rpe: 6 }, 'W', 'muscle')!, /100/)
  assert.equal(coach({ id: '1', w: 95, r: 9, rpe: 8 }, 'W', 'muscle'), null)
  assert.equal(coach({ id: '1', t: 60 }, 'T', 'muscle'), null)
  assert.match(coach({ id: '1', w: 200, r: 6, rpe: 6 }, 'W', 'strength')!, /210/)
  assert.equal(roundLoad(95 * 1.05), 100)
  assert.equal(roundLoad(45 * 1.05), 47.5)
})

check('set formatting matches the ghost line', () => {
  assert.equal(fmtSet({ id: '1', w: 135, r: 8, rpe: 8 }, 'W'), '135 x 8 @8')
  assert.equal(fmtSet({ id: '1', r: 12 }, 'R'), '12')
  assert.equal(fmtSet({ id: '1', t: 90 }, 'T'), '1:30')
  assert.equal(fmtSet({ id: '1', w: 70, d: 50 }, 'WD'), '70 x 50 ft')
  assert.equal(fmtSet({ id: '1', t: 1200, d: 2.1 }, 'C'), '20:00, 2.1 mi')
  assert.equal(fmtTime(3725), '1:02:05')
  assert.equal(parseClock('1:30'), 90)
  assert.equal(parseClock('90'), 90)
  assert.equal(parseClock(''), null)
})

check('top set picks the heaviest then the most reps', () => {
  const best = topSet({
    id: 'e',
    name: 'Incline Dumbbell Press',
    type: 'W',
    sets: [
      { id: '1', w: 70, r: 10 },
      { id: '2', w: 80, r: 6 },
      { id: '3', w: 80, r: 8 },
    ],
  })
  assert.equal(best?.id, '3')
})

check('v1 set strings come apart', () => {
  assert.deepEqual({ ...parseSetString('135x8 @8', 'W'), id: '' }, { id: '', w: 135, r: 8, rpe: 8 })
  assert.deepEqual({ ...parseSetString('12', 'R'), id: '' }, { id: '', r: 12 })
  assert.deepEqual({ ...parseSetString('1:30', 'T'), id: '' }, { id: '', t: 90 })
  assert.deepEqual({ ...parseSetString('70 x 50', 'WD'), id: '' }, { id: '', w: 70, d: 50 })
  assert.deepEqual({ ...parseSetString('20:00 2.1mi', 'C'), id: '' }, { id: '', t: 1200, d: 2.1 })
})

check('artifact v2 blob imports', () => {
  const blob = {
    workouts: [
      {
        id: 'w1',
        date: '2026-08-11',
        title: 'Summer 4 Day Push',
        exercises: [
          { id: 'e1', name: 'Incline Dumbbell Press', type: 'W', sets: [{ w: 80, r: 8, rpe: 8 }] },
          { id: 'e2', name: 'Plank', type: 'T', sets: [{ t: 60 }] },
        ],
      },
    ],
    custom: [{ id: 'c1', name: 'Cable Y Raise', type: 'W' }],
    customWorkouts: [{ id: 'cw1', name: 'Arms', items: [{ name: 'Hammer Curl', type: 'W' }] }],
    settings: { goal: 'muscle' },
  }
  const data = importArtifactData(blob)
  assert.equal(data.workouts.length, 1)
  assert.equal(data.workouts[0].exercises[0].sets[0].w, 80)
  assert.equal(data.workouts[0].exercises[1].type, 'T')
  assert.equal(data.custom[0].name, 'Cable Y Raise')
  assert.equal(data.customWorkouts[0].items[0].name, 'Hammer Curl')
  assert.equal(data.settings.goal, 'muscle')
  assert.notEqual(data.workouts[0].id, 'w1')
})

check('legacy v1 array with string sets imports', () => {
  const data = importArtifactData([
    { date: '2026-01-02', title: 'Legs', exercises: [{ name: 'Leg Press', sets: ['300x10', '320x8 @9'] }] },
  ])
  assert.equal(data.workouts[0].exercises[0].type, 'W')
  assert.equal(data.workouts[0].exercises[0].sets[1].rpe, 9)
  assert.equal(data.workouts[0].exercises[0].sets[1].w, 320)
})

check('csv export is one row per set', () => {
  const workouts: Workout[] = [
    {
      id: 'w',
      date: '2026-08-11',
      title: 'Push, hard',
      exercises: [
        { id: 'e', name: 'Incline Dumbbell Press', type: 'W', sets: [{ id: 's1', w: 80, r: 8, rpe: 8 }, { id: 's2', w: 80, r: 7 }] },
      ],
    },
  ]
  const lines = toCsv(workouts).split('\n')
  assert.equal(lines.length, 3)
  assert.match(lines[1], /^2026-08-11,"Push, hard",Incline Dumbbell Press,W,1,80,8,8,,,$/)
})

check('experience score and level follow the bands', () => {
  assert.equal(level({}), 'Beginner')
  assert.equal(level({ years: 'never', before: 'no' }), 'Beginner')
  assert.equal(level({ years: 'under6', before: 'thisYear' }), 'Returner')
  assert.equal(level({ years: 'sixToTwo' }), 'Intermediate')
  assert.equal(level({ years: 'overTwo' }), 'Intermediate')
  assert.equal(level({ years: 'overTwo', barbell: 'confident' }), 'Advanced')
  assert.equal(experienceScore({ years: 'overTwo', barbell: 'confident' }), 5)
})

check('the plan points at template days that exist', () => {
  const cases = [
    { years: 'never' as const, days: 2 },
    { years: 'never' as const, days: 3 },
    { years: 'under6' as const, before: 'thisYear' as const, days: 4 },
    { years: 'sixToTwo' as const, days: 3 },
    { years: 'overTwo' as const, barbell: 'confident' as const, days: 4 },
    { years: 'overTwo' as const, barbell: 'confident' as const, days: 5 },
  ]
  for (const profile of cases) {
    const plan = planFor(profile, 'muscle')
    assert.equal(plan.dayIds.length, plan.days, `${plan.splitName} ${plan.days}`)
    for (const id of plan.dayIds) assert.ok(dayById(id), `missing template day ${id}`)
  }
  assert.equal(planFor({ years: 'never', days: 6 }, 'muscle').days, 5)
  assert.equal(planFor({ years: 'never', days: 6 }, 'muscle').capped, true)
})

check('RPE stays hidden until the number means something', () => {
  assert.equal(planFor({ years: 'never' }, 'muscle').showRpe, false)
  assert.equal(planFor({ years: 'under6', before: 'thisYear' }, 'muscle').showRpe, false)
  assert.equal(planFor({ years: 'sixToTwo' }, 'muscle').showRpe, true)
})

check('a sore knee changes the movement, not the session', () => {
  const day = dayById('ul-lower-a')!
  const plain = buildDay(day, {}).map((i) => i.name)
  const knee = buildDay(day, { sore: ['Knee'] })
  assert.ok(plain.includes('Back Squat'))
  assert.ok(!knee.some((i) => i.name === 'Back Squat'), 'squat survived a bad knee')
  assert.equal(knee.length, plain.length, 'the session lost an exercise instead of swapping it')
  assert.ok(knee.some((i) => i.swappedFrom === 'Back Squat' && i.name === 'Leg Press'), 'a knee wants the leg press')
  const backs = buildDay(dayById('ul-lower-a')!, { sore: ['Low back'] })
  assert.ok(!backs.some((i) => /Deadlift|Good Morning/.test(i.name)), 'a hinge survived a bad back')
  assert.ok(backs.some((i) => i.swappedFrom === 'Romanian Deadlift' && /Curl/.test(i.name)))
})

check('bodyweight only leaves nothing that needs a rack', () => {
  for (const id of ['fb-a', 'fb-b', 'ul-upper-a']) {
    const items = buildDay(dayById(id)!, { access: 'body' })
    assert.ok(items.length >= 3, `${id} came back with ${items.length}`)
    for (const item of items) {
      assert.equal(equipmentOf(item.name), 'bodyweight', `${item.name} is not bodyweight`)
    }
  }
})

check('a shorter session means fewer movements, and the cap never splits the circuit', () => {
  const day = dayById('five-chest')!

  // 60 minutes: whole circuit plus four mains, never an orphaned circuit member
  const hour = buildDay(day, { minutes: 60 })
  assert.equal(hour.length, 8)
  const circuit = hour.filter((i) => i.superset)
  assert.equal(circuit.length, 4, `circuit arrived as ${circuit.length} of 4`)
  assert.equal(hour[0].name, 'Incline Dumbbell Press', 'the first main survives the cap')

  // 30 minutes: no room to keep the circuit whole, so it goes entirely
  const half = buildDay(day, { minutes: 30 })
  assert.equal(half.length, 4)
  assert.ok(half.every((i) => !i.superset), 'a partial circuit leaked into the short session')

  // 45 minutes: circuit (4) fits within cap 6 minus the two reserved mains
  const mid = buildDay(day, { minutes: 45 })
  assert.equal(mid.length, 6)
  assert.equal(mid.filter((i) => i.superset).length, 4)

  assert.ok(buildDay(day, { minutes: 75 }).length >= 8)
})

check('dislikes are never suggested', () => {
  const items = buildDay(dayById('fb-a')!, { dislikes: ['Back Squat', 'Plank'] })
  assert.ok(!items.some((i) => i.name === 'Back Squat' || i.name === 'Plank'))
})

check('the check-in fires once, on a rolling window, and an answer sticks', () => {
  const today = '2026-08-18'
  // not before four weeks have passed since onboarding
  assert.equal(needsCheckin({ days: 4 }, '2026-08-01T00:00:00Z', 2, today), false)
  // after four weeks, low recent attendance fires it
  assert.equal(needsCheckin({ days: 4 }, '2026-07-01T00:00:00Z', 5, today), true)
  // a strong recent month clears a weak start
  assert.equal(needsCheckin({ days: 4 }, '2026-07-01T00:00:00Z', 12, today), false)
  // an answer, either way, is final
  assert.equal(
    needsCheckin({ days: 4, checkinDismissedAt: '2026-08-01T00:00:00Z' }, '2026-07-01T00:00:00Z', 2, today),
    false,
  )
  // a two day plan is never nagged toward two days
  assert.equal(needsCheckin({ days: 2 }, '2026-07-01T00:00:00Z', 2, today), false)
  // never onboarded, never nagged
  assert.equal(needsCheckin({ days: 4 }, null, 0, today), false)
})

const HISTORY: Workout[] = [
  {
    id: 'w1', date: '2026-08-03', title: 'Push',
    exercises: [
      { id: 'e1', name: 'Incline Dumbbell Press', type: 'W', sets: [
        { id: 's1', w: 70, r: 10 }, { id: 's2', w: 70, r: 9 },
      ] },
      { id: 'e2', name: 'Plank', type: 'T', sets: [{ id: 's3', t: 60 }] },
    ],
  },
  {
    id: 'w2', date: '2026-08-10', title: 'Push',
    exercises: [
      { id: 'e3', name: 'Incline Dumbbell Press', type: 'W', sets: [
        { id: 's4', w: 75, r: 8 }, { id: 's5', w: 75, r: 7 },
      ] },
    ],
  },
]

check('bests come from every earlier session, not just the last one', () => {
  const b = bestsFor(HISTORY, 'Incline Dumbbell Press', 'today', '2026-08-18')
  assert.equal(b.load, 75)
  assert.equal(b.reps, 10)
  assert.equal(b.volume, 1330, '70 x 10 plus 70 x 9 is the bigger session')
  assert.ok(Math.abs(b.e1rm - 95) < 0.1, `estimated max was ${b.e1rm}`)
  assert.equal(b.seen, true)
  assert.equal(bestsFor(HISTORY, 'Leg Press', 'today', '2026-08-18').seen, false)
})

check('a first outing is never a PR', () => {
  const fresh = bestsFor(HISTORY, 'Leg Press', 'today', '2026-08-18')
  assert.deepEqual(prsFor({ id: 'x', w: 400, r: 10 }, 'W', fresh, 'muscle'), [])
})

check('PRs fire on load, reps and estimated max', () => {
  const b = bestsFor(HISTORY, 'Incline Dumbbell Press', 'today', '2026-08-18')
  assert.deepEqual(prsFor({ id: 'x', w: 80, r: 8 }, 'W', b, 'muscle'), ['e1rm', 'load'])
  assert.deepEqual(prsFor({ id: 'x', w: 75, r: 11 }, 'W', b, 'muscle'), ['e1rm', 'reps'])
  assert.deepEqual(prsFor({ id: 'x', w: 70, r: 9 }, 'W', b, 'muscle'), [])
  assert.deepEqual(prsFor({ id: 'x', t: 90 }, 'T', bestsFor(HISTORY, 'Plank', 'today', '2026-08-18'), 'muscle'), ['time'])
})

check('a grindy single is not a PR unless strength is the goal', () => {
  const b = bestsFor(HISTORY, 'Incline Dumbbell Press', 'today', '2026-08-18')
  const single = { id: 'x', w: 100, r: 1 }
  assert.deepEqual(prsFor(single, 'W', b, 'muscle'), [])
  assert.ok(prsFor(single, 'W', b, 'strength').includes('load'))
})

check('session volume PR reads the whole exercise', () => {
  const b = bestsFor(HISTORY, 'Incline Dumbbell Press', 'today', '2026-08-18')
  const big = { id: 'e', name: 'Incline Dumbbell Press', type: 'W' as const, sets: [
    { id: 'a', w: 75, r: 10 }, { id: 'b', w: 75, r: 10 },
  ] }
  assert.equal(volumePr(big, b), true)
  const small = { ...big, sets: [{ id: 'a', w: 75, r: 5 }] }
  assert.equal(volumePr(small, b), false)
})

check('beating the ghost compares set for set', () => {
  assert.equal(beatsLast({ id: 'x', w: 75, r: 9 }, { id: 'y', w: 75, r: 8 }, 'W'), true)
  assert.equal(beatsLast({ id: 'x', w: 80, r: 7 }, { id: 'y', w: 75, r: 8 }, 'W'), true)
  assert.equal(beatsLast({ id: 'x', w: 75, r: 8 }, { id: 'y', w: 75, r: 8 }, 'W'), false)
  assert.equal(beatsLast({ id: 'x', t: 70 }, { id: 'y', t: 60 }, 'T'), true)
  assert.equal(beatsLast({ id: 'x', w: 75, r: 9 }, undefined, 'W'), false)
  assert.ok(e1rm({ id: 'x', w: 100, r: 10 })! > e1rm({ id: 'y', w: 100, r: 9 })!)
})

check('weekly coverage counts logged sets by muscle group', () => {
  const week: Workout[] = [
    { id: 'a', date: '2026-08-17', title: 'Push', exercises: [
      { id: 'e', name: 'Incline Dumbbell Press', type: 'W', sets: [
        { id: '1', w: 80, r: 8 }, { id: '2', w: 80, r: 8 }, { id: '3' },
      ] },
    ] },
  ]
  const chest = weeklyCoverage(week, '2026-08-18').find((g) => g.group === 'Chest')!
  assert.equal(chest.sets, 2, 'the empty set row should not count')
  assert.equal(weeklyCoverage(week, '2026-08-25').find((g) => g.group === 'Chest')!.sets, 0, 'last week is not this week')
  assert.equal(weekStart('2026-08-18'), '2026-08-17', 'weeks start on Monday')
})

check('the 28 day grid marks only days with something written down', () => {
  const grid = trainingGrid(HISTORY, '2026-08-18')
  assert.equal(grid.length, 28)
  assert.equal(grid[grid.length - 1].date, '2026-08-18')
  assert.equal(grid.filter((d) => d.trained).length, 2)
})

check('the streak counts weeks, so a rest day costs nothing', () => {
  const set = (id: string, date: string): Workout => ({
    id, date, title: 'x',
    exercises: [{ id: id + 'e', name: 'Leg Press', type: 'W', sets: [{ id: id + 's', w: 100, r: 10 }] }],
  })
  const weeks = [
    set('a', '2026-08-17'), set('b', '2026-08-19'),
    set('c', '2026-08-10'), set('d', '2026-08-12'),
    set('e', '2026-08-03'),
  ]
  assert.equal(weeklyStreak(weeks, '2026-08-19', 2), 2, 'two full weeks, the third only had one day')
  assert.equal(weeklyStreak(weeks, '2026-08-19', 3), 0)
  // A quiet current week must not wipe out the weeks behind it.
  assert.equal(weeklyStreak(weeks, '2026-08-24', 2), 2, 'the two completed weeks behind it still count')
})

check('lifetime totals count only what was written down', () => {
  const t = lifetime(HISTORY)
  assert.equal(t.sessions, 2)
  assert.equal(t.sets, 5)
  assert.equal(t.reps, 34)
  assert.equal(t.volume, 70 * 10 + 70 * 9 + 75 * 8 + 75 * 7)
  assert.equal(t.seconds, 60)

  const blank: Workout[] = [
    { id: 'z', date: '2026-08-18', title: 'started, never logged', exercises: [
      { id: 'e', name: 'Leg Press', type: 'W', sets: [{ id: 's' }] },
    ] },
  ]
  assert.equal(lifetime(blank).sessions, 0, 'an empty session is not a session')
})

check('landmarks point at the next round number', () => {
  assert.deepEqual(nextLandmark(0, LADDERS.sessions).next, 10)
  assert.deepEqual(nextLandmark(10, LADDERS.sessions).next, 25)
  const half = nextLandmark(30, [0, 20, 40])
  assert.equal(half.next, 40)
  assert.equal(Math.round(half.pct), 50)
  assert.equal(nextLandmark(99_999_999, LADDERS.volume).next, null)
  assert.equal(nextLandmark(99_999_999, LADDERS.volume).pct, 100)
})

check('the wave runs three weeks and repeats', () => {
  assert.equal(waveWeek({}, '2026-08-18'), null, 'off unless it is turned on')
  const on = { wave: true, waveStart: '2026-08-03' }
  assert.equal(waveWeek(on, '2026-08-05')!.index, 1)
  assert.equal(waveWeek(on, '2026-08-12')!.index, 2)
  assert.equal(waveWeek(on, '2026-08-19')!.index, 3)
  assert.equal(waveWeek(on, '2026-08-26')!.index, 1, 'and round again')
  assert.equal(mondayOf('2026-08-19'), '2026-08-17')
  assert.deepEqual(WAVE.map((w) => w.rpe[1]), [8.5, 9.5, 10])
})

check('the wave reads the RPE actually logged this week', () => {
  const week = WAVE[1]
  const sets = (rpe: number[]): Workout[] => [
    { id: 'w', date: '2026-08-18', title: 'Push', exercises: [
      { id: 'e', name: 'Incline Dumbbell Press', type: 'W',
        sets: rpe.map((v, i) => ({ id: String(i), w: 80, r: 8, rpe: v })) },
    ] },
  ]
  assert.equal(readWave(sets([9, 9]), week, '2026-08-18').verdict, 'on')
  assert.equal(readWave(sets([7, 7]), week, '2026-08-18').verdict, 'under')
  assert.equal(readWave(sets([10, 10]), week, '2026-08-18').verdict, 'over')
  assert.equal(readWave([], week, '2026-08-18').verdict, null)
  assert.equal(readWave(sets([9, 8]), week, '2026-08-18').average, 8.5)
})

check('the coach aims at the wave week rather than the goal band', () => {
  const set = { id: 'x', w: 100, r: 8, rpe: 9 }
  assert.equal(coach(set, 'W', 'muscle'), null, 'RPE 9 is inside the muscle band')
  assert.match(coach(set, 'W', 'muscle', WAVE[0].rpe)!, /over target/, 'but too hard for a build week')
  assert.equal(coach(set, 'W', 'muscle', WAVE[1].rpe), null, 'and right for a push week')
  assert.match(coach(set, 'W', 'muscle', WAVE[2].rpe)!, /under target/, 'and easy for a send week')
})

check('a set is only a set once the fields that matter are filled', () => {
  assert.equal(isFullSet({ id: 'a', w: 80 }, 'W'), false, 'a load with no reps is half a set')
  assert.equal(isFullSet({ id: 'a', r: 8 }, 'W'), false)
  assert.equal(isFullSet({ id: 'a', w: 80, r: 8 }, 'W'), true)
  assert.equal(isFullSet({ id: 'a', r: 12 }, 'R'), true)
  assert.equal(isFullSet({ id: 'a', t: 60 }, 'T'), true)
  assert.equal(isFullSet({ id: 'a', w: 70, d: 50 }, 'WD'), true)
})

check('rest is longer for the big movements and the heavier goal', () => {
  assert.equal(isCompound('Back Squat'), true)
  assert.equal(isCompound('Barbell Row'), true)
  assert.equal(isCompound('Lateral Raise'), false)
  assert.equal(isCompound('Leg Extension'), false, 'extension is not a press')
  assert.equal(isCompound('Cable Curl'), false)

  assert.ok(restFor('Back Squat', 'W', 'strength') > restFor('Back Squat', 'W', 'muscle'))
  assert.ok(restFor('Back Squat', 'W', 'muscle') > restFor('Lateral Raise', 'W', 'muscle'))
  assert.ok(restFor('Lateral Raise', 'W', 'muscle') > restFor('Cable Curl', 'W', 'muscle'))
  assert.ok(restFor('Back Squat', 'W', 'endurance') <= 60)
  assert.equal(restFor('Run', 'C', 'muscle'), 0, 'cardio does not rest between sets')
})

check('consecutive exercises sharing a tag are one superset', () => {
  const ex = (id: string, name: string, superset: string | null = null): Exercise => ({
    id, name, type: 'W', sets: [], superset,
  })
  const runs = groupRuns([
    ex('1', 'Back Squat'),
    ex('2', 'Incline Dumbbell Press', 'a'),
    ex('3', 'Barbell Row', 'a'),
    ex('4', 'Cable Curl'),
    ex('5', 'Lateral Raise', 'b'),
    ex('6', 'Face Pull', 'b'),
  ])
  assert.equal(runs.length, 4)
  assert.deepEqual(runs.map((r) => r.exercises.length), [1, 2, 1, 2])
  assert.equal(isSuperset(runs[0]), false)
  assert.equal(isSuperset(runs[1]), true)
  assert.equal(supersetLetter(runs[1].index), 'A')
  assert.equal(supersetLetter(runs[3].index), 'B')
})

check('a tagged exercise on its own is not a superset', () => {
  const lonely: Exercise = { id: '1', name: 'Back Squat', type: 'W', sets: [], superset: 'a' }
  const runs = groupRuns([lonely])
  assert.equal(runs.length, 1)
  assert.equal(isSuperset(runs[0]), false, 'one movement is just a movement')
})

check('the same tag either side of a gap is two supersets', () => {
  const ex = (id: string, superset: string | null): Exercise => ({
    id, name: 'Cable Curl', type: 'W', sets: [], superset,
  })
  const runs = groupRuns([ex('1', 'a'), ex('2', 'a'), ex('3', null), ex('4', 'a'), ex('5', 'a')])
  assert.equal(runs.length, 3)
  assert.equal(supersetLetter(runs[0].index), 'A')
  assert.equal(supersetLetter(runs[2].index), 'B')
})

check('a superset rests as long as its hungriest movement', () => {
  const run = groupRuns([
    { id: '1', name: 'Back Squat', type: 'W', sets: [], superset: 'a' },
    { id: '2', name: 'Cable Curl', type: 'W', sets: [], superset: 'a' },
  ])[0]
  assert.equal(supersetRest(run, 'muscle'), restFor('Back Squat', 'W', 'muscle'))
  assert.ok(supersetRest(run, 'muscle') > restFor('Cable Curl', 'W', 'muscle'))
})

check('a series needs two sessions before there is a line', () => {
  assert.equal(seriesFor(HISTORY, 'Plank'), null, 'one session is a dot, not a trend')
  assert.equal(seriesFor(HISTORY, 'Leg Press'), null)
  assert.ok(seriesFor(HISTORY, 'Incline Dumbbell Press'))
})

check('the series takes the best set of each session, oldest first', () => {
  const s = seriesFor(HISTORY, 'Incline Dumbbell Press')!
  assert.equal(s.points.length, 2)
  assert.deepEqual(s.points.map((p) => p.date), ['2026-08-03', '2026-08-10'])
  assert.equal(s.points[0].label, '70 x 10')
  assert.equal(s.metric, 'Estimated max')
  assert.ok(Math.abs(s.points[0].value - 93.3) < 0.2)
  assert.ok(Math.abs(s.latest - 95) < 0.2)
  assert.equal(Math.round(s.best), 95)
  assert.ok(s.change !== null && s.change > 0, 'it went up')
})

check('two sessions on one day are one point, at the better of them', () => {
  const twice: Workout[] = [
    ...HISTORY,
    { id: 'w2b', date: '2026-08-10', title: 'Push again', exercises: [
      { id: 'e4', name: 'Incline Dumbbell Press', type: 'W', sets: [{ id: 's5', w: 85, r: 6 }] },
    ] },
  ]
  const s = seriesFor(twice, 'Incline Dumbbell Press')!
  assert.equal(s.points.length, 2, 'still two dates')
  assert.equal(s.points[1].label, '85 x 6', 'the better of the two on that day')
})

check('movements rank by how many sessions they appear in', () => {
  const busy: Workout[] = [
    ...HISTORY,
    { id: 'w3', date: '2026-08-17', title: 'Push', exercises: [
      { id: 'e5', name: 'Incline Dumbbell Press', type: 'W', sets: [{ id: 's6', w: 80, r: 8 }] },
      { id: 'e6', name: 'Plank', type: 'T', sets: [{ id: 's7', t: 75 }] },
    ] },
  ]
  const names = trackedNames(busy)
  assert.equal(names[0], 'Incline Dumbbell Press', 'three sessions beats two')
  assert.ok(names.includes('Plank'))
  assert.ok(!names.includes('Leg Press'), 'one session is not enough to rank')
})

const ex = (id: string, name: string, superset: string | null = null, type: 'W' | 'T' = 'W'): Exercise => ({
  id, name, type, sets: [], superset,
})

check('the big compound movement goes first', () => {
  const order = hardestFirst([
    ex('1', 'Cable Curl'),
    ex('2', 'Plank', null, 'T'),
    ex('3', 'Lateral Raise'),
    ex('4', 'Back Squat'),
    ex('5', 'Barbell Row'),
  ]).map((e) => e.name)

  assert.equal(order[0], 'Back Squat', 'a squat should never sit behind a curl')
  assert.equal(order[1], 'Barbell Row')
  assert.equal(order[order.length - 1], 'Plank', 'the core work stays at the end')
  assert.ok(order.indexOf('Lateral Raise') < order.indexOf('Cable Curl'), 'shoulders outrank arms')
})

check('muscle group size ranks large, medium, small', () => {
  assert.equal(groupSize('Back Squat'), 3)
  assert.equal(groupSize('Lateral Raise'), 2)
  assert.equal(groupSize('Cable Curl'), 1)
})

check('their own numbers break the tie between two big lifts', () => {
  const history: Workout[] = [
    { id: 'w', date: '2026-08-11', title: 'Legs', exercises: [
      { id: 'a', name: 'Leg Press', type: 'W', sets: [{ id: '1', w: 400, r: 10 }] },
      { id: 'b', name: 'Barbell Row', type: 'W', sets: [{ id: '2', w: 135, r: 10 }] },
    ] },
  ]
  const loads = topLoads(history)
  assert.ok(loads.get('Leg Press')! > loads.get('Barbell Row')!)
  const order = hardestFirst([ex('1', 'Barbell Row'), ex('2', 'Leg Press')], loads).map((e) => e.name)
  assert.equal(order[0], 'Leg Press', 'the heavier of the two goes first')

  // With no history to go on, the order it was given survives.
  const blind = hardestFirst([ex('1', 'Barbell Row'), ex('2', 'Leg Press')]).map((e) => e.name)
  assert.equal(blind[0], 'Barbell Row')
})

check('a superset moves and sorts as one thing', () => {
  const list = [ex('1', 'Cable Curl'), ex('2', 'Back Squat', 's'), ex('3', 'Leg Extension', 's')]
  const sorted = hardestFirst(list).map((e) => e.id)
  assert.deepEqual(sorted, ['2', '3', '1'], 'the pair travels together, ranked by the squat')

  const moved = moveRun(sorted.map((id) => list.find((e) => e.id === id)!), '1', -1).map((e) => e.id)
  assert.deepEqual(moved, ['1', '2', '3'], 'moving the curl up jumps the whole superset')

  const stuck = moveRun(list, '1', -1).map((e) => e.id)
  assert.deepEqual(stuck, ['1', '2', '3'], 'nothing moves off the top')
})

check('a session already in order is left alone', () => {
  const list = [ex('1', 'Back Squat'), ex('2', 'Cable Curl')]
  assert.equal(isHardestFirst(list), true)
  assert.equal(isHardestFirst([list[1], list[0]]), false)
})

check('five supersets in one workout letter themselves A to E', () => {
  const list: Exercise[] = []
  for (let g = 0; g < 5; g++) {
    for (let m = 0; m < 2; m++) {
      list.push({ id: `${g}-${m}`, name: 'Cable Curl', type: 'W', sets: [], superset: `group${g}` })
    }
  }
  const runs = groupRuns(list)
  assert.equal(runs.length, 5)
  assert.ok(runs.every((r) => isSuperset(r)))
  assert.deepEqual(runs.map((r) => supersetLetter(r.index)), ['A', 'B', 'C', 'D', 'E'])
})

check('the knowledge base is well formed', () => {
  assert.ok(KNOWLEDGE.length >= 35, `only ${KNOWLEDGE.length} entries`)
  const ids = KNOWLEDGE.map((e) => e.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate entry ids')
  for (const e of KNOWLEDGE) {
    assert.ok((KNOWLEDGE_GROUPS as readonly string[]).includes(e.group), `${e.id} has group ${e.group}`)
    assert.ok(e.aliases.length >= 2, `${e.id} needs aliases to be findable`)
    assert.ok(e.a.length > 80, `${e.id} answer too thin`)
    assert.ok(!/[\u2013\u2014]/.test(e.a) && !/[\u2013\u2014]/.test(e.q), `${e.id} contains an em or en dash`)
  }
})

check('the questions people actually type find their answers', () => {
  const first = (q: string) => searchKnowledge(q)[0]?.id
  assert.equal(first('what is a drop set'), 'basic-dropset')
  assert.equal(first('what is a superset'), 'basic-superset')
  assert.ok(['strong-progression', 'strong-increments'].includes(first('how should I increase my weights week by week')!))
  assert.equal(first('what does rpe 8 mean'), 'basic-rpe')
  assert.ok(searchKnowledge('protein').some((e) => e.id === 'basic-protein'))
  assert.ok(searchKnowledge('multiple supersets').some((e) => e.id === 'app-superset-how'))
  assert.ok(searchKnowledge('lost my wifi').some((e) => e.id === 'app-offline'))
  assert.ok(searchKnowledge('deload').some((e) => e.id === 'strong-deload'))
})

check('the gate holds: off topic questions return nothing', () => {
  assert.deepEqual(searchKnowledge('best crypto to buy'), [])
  assert.deepEqual(searchKnowledge('who won the election'), [])
  assert.deepEqual(searchKnowledge(''), [])
})

console.log(`\n${checks} checks passed`)
