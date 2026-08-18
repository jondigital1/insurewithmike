// Plain assertions over the pure logic: library, templates, coaching, the
// artifact importer and CSV export. Run with npm run check.
import assert from 'node:assert/strict'
import { LIBRARY, MUSCLE_GROUPS, lookupType } from '../lib/exercises'
import { SPLITS, dayItems } from '../lib/templates'
import { coach, roundLoad } from '../lib/coach'
import { fmtSet, fmtTime, parseClock, topSet } from '../lib/format'
import { importArtifactData, parseSetString } from '../lib/importer'
import { toCsv } from '../lib/csv'
import { buildDay, dayById, experienceScore, firstMonth, level, planFor } from '../lib/onboarding'
import { equipmentOf } from '../lib/exercises'
import {
  beatsLast, bestsFor, e1rm, prsFor, trainingGrid, volumePr, weeklyCoverage, weeklyStreak, weekStart,
} from '../lib/gamify'
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
      assert.ok(day.exercises.includes('Plank'), `${day.name} has no core circuit`)
      assert.ok(day.exercises.includes('Hanging Leg Raise'), `${day.name} has no core circuit`)
      for (const bad of banned) assert.ok(!day.exercises.includes(bad), `${day.name} has ${bad}`)
    }
  }
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

check('a shorter session means fewer movements', () => {
  const day = dayById('five-chest')!
  assert.equal(buildDay(day, { minutes: 30 }).length, 4)
  assert.equal(buildDay(day, { minutes: 45 }).length, 6)
  assert.ok(buildDay(day, { minutes: 75 }).length >= 8)
})

check('dislikes are never suggested', () => {
  const items = buildDay(dayById('fb-a')!, { dislikes: ['Back Squat', 'Plank'] })
  assert.ok(!items.some((i) => i.name === 'Back Squat' || i.name === 'Plank'))
})

check('first 28 days counts distinct training days', () => {
  assert.equal(firstMonth([]), null)
  const start = new Date()
  start.setDate(start.getDate() - 30)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const day = (n: number) => {
    const d = new Date(start)
    d.setDate(d.getDate() + n)
    return iso(d)
  }
  const month = firstMonth([day(0), day(2), day(2), day(9), day(29)])!
  assert.equal(month.days, 3, 'day 29 should fall outside the window and the repeat should count once')
  assert.ok(month.elapsed >= 28)
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

console.log(`\n${checks} checks passed`)
