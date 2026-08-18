import { LIBRARY, equipmentOf, groupOf, lookupType } from './exercises'
import { dayItems, SPLITS, type TemplateDay } from './templates'
import type { CustomWorkoutItem, Goal, SetType } from './types'

// Everything the first run asks, plus the questions that arrive later in
// context. See docs/onboarding-research.md for why each one earns its place.
export interface Profile {
  condition?: 'no' | 'yes' | 'skip'
  symptoms?: 'no' | 'yes'
  years?: 'never' | 'under6' | 'sixToTwo' | 'overTwo'
  before?: 'no' | 'thisYear' | 'longAgo'
  days?: number
  access?: 'full' | 'basic' | 'home' | 'body'
  minutes?: 30 | 45 | 60 | 75
  sore?: string[]
  redFlag?: boolean
  barbell?: 'confident' | 'rusty' | 'never' | 'no'
  other?: string[]
  age?: 'under40' | '40to59' | 'over60'
  dislikes?: string[]
  goalChoice?: 'muscle' | 'strength' | 'lean' | 'health'
  wave?: boolean
  waveStart?: string
  // When the four week check-in was answered, either way. Once set it never
  // shows again: answered is answered.
  checkinDismissedAt?: string
}

export const SORE_JOINTS = ['Knee', 'Low back', 'Shoulder', 'Hip', 'Elbow', 'Neck', 'Wrist']
export const OTHER_TRAINING = ['Running', 'Cycling', 'Sport', 'Classes', 'Walking']
export const COMMON_DISLIKES = [
  'Burpees', 'Back Squat', 'Deadlift', 'Walking Lunge', 'Overhead Press', 'Plank', 'Run',
]

export type Level = 'Beginner' | 'Returner' | 'Intermediate' | 'Advanced'

const YEARS_SCORE = { never: 0, under6: 1, sixToTwo: 2, overTwo: 3 }
const BEFORE_SCORE = { no: 0, longAgo: 1, thisYear: 2 }
const BARBELL_SCORE = { never: 0, no: 0, rusty: 1, confident: 2 }

export function experienceScore(p: Profile): number {
  return (
    (p.years ? YEARS_SCORE[p.years] : 0) +
    (p.before ? BEFORE_SCORE[p.before] : 0) +
    (p.barbell ? BARBELL_SCORE[p.barbell] : 0)
  )
}

// Max reachable score is 5: the returner question is only asked of people who
// said never or under 6 months, so it never stacks on top of two years.
export function level(p: Profile): Level {
  const s = experienceScore(p)
  const green = p.years === 'never' || p.years === 'under6' || !p.years
  if (s <= 1) return 'Beginner'
  if (s <= 3) return green ? 'Returner' : 'Intermediate'
  if (s <= 4) return 'Intermediate'
  return 'Advanced'
}

// Level by days, over the template days that already exist. Beginners run full
// body because a missed session still leaves every muscle trained that week.
const TABLE: Record<Level, Record<number, string[]>> = {
  Beginner: {
    2: ['fb-a', 'fb-b'],
    3: ['fb-a', 'fb-b', 'fb-c'],
    4: ['ul-upper-a', 'ul-lower-a', 'ul-upper-b', 'ul-lower-b'],
    5: ['ul-upper-a', 'ul-lower-a', 'ul-upper-b', 'ul-lower-b', 'fb-c'],
  },
  Returner: {
    2: ['fb-a', 'fb-b'],
    3: ['fb-a', 'fb-b', 'fb-c'],
    4: ['fb-a', 'fb-b', 'fb-c', 'ul-upper-a'],
    5: ['ul-upper-a', 'ul-lower-a', 'ul-upper-b', 'ul-lower-b', 'fb-c'],
  },
  Intermediate: {
    2: ['ul-upper-a', 'ul-lower-a'],
    3: ['ppl-push', 'ppl-pull', 'ppl-legs'],
    4: ['ul-upper-a', 'ul-lower-a', 'ul-upper-b', 'ul-lower-b'],
    5: ['five-chest', 'five-back', 'five-legs', 'five-shoulders', 'five-pump'],
  },
  Advanced: {
    2: ['ul-upper-a', 'ul-lower-a'],
    3: ['ppl-push', 'ppl-pull', 'ppl-legs'],
    4: ['summer4-push', 'summer4-pull', 'summer4-legs', 'summer4-upper'],
    5: ['five-chest', 'five-back', 'five-legs', 'five-shoulders', 'five-pump'],
  },
}

const SPLIT_NAME: Record<Level, Record<number, string>> = {
  Beginner: { 2: 'Full Body', 3: 'Full Body', 4: 'Upper Lower', 5: 'Upper Lower' },
  Returner: { 2: 'Full Body', 3: 'Full Body', 4: 'Full Body, building up', 5: 'Upper Lower' },
  Intermediate: { 2: 'Upper Lower', 3: 'Push Pull Legs', 4: 'Upper Lower', 5: '5 Day' },
  Advanced: { 2: 'Upper Lower', 3: 'Push Pull Legs', 4: 'Summer 4 Day', 5: '5 Day' },
}

const ALL_DAYS: TemplateDay[] = SPLITS.flatMap((s) => s.days)

export function dayById(id: string): TemplateDay | undefined {
  return ALL_DAYS.find((d) => d.id === id)
}

// Movements each flagged joint should not be asked to do. The pattern stays,
// the movement changes: a knee means leg press, not no legs.
const SORE_BANS: Record<string, string[]> = {
  Knee: [
    'Back Squat', 'Front Squat', 'Smith Machine Squat', 'Hack Squat', 'Machine Hack Squat',
    'Cyclist Squat', 'Sissy Squat', 'Walking Lunge', 'Reverse Lunge', 'Curtsy Lunge', 'Step Up',
  ],
  'Low back': [
    'Deadlift', 'Trap Bar Deadlift', 'Rack Pull', 'Romanian Deadlift', 'Dumbbell Romanian Deadlift',
    'Single Leg Romanian Deadlift', 'Stiff Leg Deadlift', 'Good Morning', 'Barbell Row', 'Pendlay Row',
    'T Bar Row', 'Back Squat', 'Front Squat', 'Back Extension', 'Weighted Back Extension',
  ],
  Shoulder: [
    'Overhead Press', 'Seated Barbell Press', 'Push Press', 'Behind Back Wrist Curl', 'Upright Row',
    'Barbell Bench Press', 'Decline Barbell Bench Press', 'Dip', 'Weighted Dip',
  ],
  Elbow: ['Skull Crusher', 'EZ Bar Skull Crusher', 'Dumbbell Skull Crusher', 'JM Press', 'Close Grip Bench Press'],
  Wrist: ['Barbell Curl', 'Wrist Curl', 'Reverse Wrist Curl', 'Front Squat', 'Ab Wheel Rollout'],
  Hip: ['Walking Lunge', 'Curtsy Lunge', 'Deadlift', 'Good Morning'],
  Neck: ['Barbell Shrug', 'Snatch Grip High Pull', 'Upright Row'],
}

// Where a movement has an obvious right answer, name it. Falling back to the
// first workable movement in the same muscle group gives a knee a goblet squat,
// which is still a squat. A knee wants the leg press.
const PREFERRED: Record<string, string> = {
  'Back Squat': 'Leg Press',
  'Front Squat': 'Leg Press',
  'Smith Machine Squat': 'Leg Press',
  'Hack Squat': 'Leg Press',
  'Machine Hack Squat': 'Leg Press',
  'Cyclist Squat': 'Leg Extension',
  'Sissy Squat': 'Leg Extension',
  'Walking Lunge': 'Leg Press',
  'Reverse Lunge': 'Leg Extension',
  'Curtsy Lunge': 'Hip Thrust',
  'Step Up': 'Leg Extension',
  'Goblet Squat': 'Leg Press',
  Deadlift: 'Seated Leg Curl',
  'Trap Bar Deadlift': 'Leg Press',
  'Rack Pull': 'Chest Supported Row',
  'Romanian Deadlift': 'Lying Leg Curl',
  'Dumbbell Romanian Deadlift': 'Seated Leg Curl',
  'Single Leg Romanian Deadlift': 'Seated Leg Curl',
  'Stiff Leg Deadlift': 'Seated Leg Curl',
  'Good Morning': 'Seated Leg Curl',
  'Barbell Row': 'Chest Supported Row',
  'Pendlay Row': 'Chest Supported Row',
  'T Bar Row': 'Chest Supported Row',
  'Overhead Press': 'Machine Shoulder Press',
  'Seated Barbell Press': 'Machine Shoulder Press',
  'Push Press': 'Machine Shoulder Press',
  'Upright Row': 'Face Pull',
  'Barbell Bench Press': 'Machine Chest Press',
  'Decline Barbell Bench Press': 'Machine Chest Press',
  Dip: 'Machine Chest Press',
  'Weighted Dip': 'Machine Chest Press',
  'Barbell Curl': 'Cable Curl',
  'Skull Crusher': 'Rope Pushdown',
  'EZ Bar Skull Crusher': 'Rope Pushdown',
  'Dumbbell Skull Crusher': 'Rope Pushdown',
  'Close Grip Bench Press': 'Rope Pushdown',
  'JM Press': 'Rope Pushdown',
  'Barbell Shrug': 'Cable Shrug',
  'Snatch Grip High Pull': 'Cable Shrug',
  'Ab Wheel Rollout': 'Cable Crunch',
  'Wrist Curl': 'Dead Hang',
  'Reverse Wrist Curl': 'Dead Hang',
  'Back Extension': 'Seated Leg Curl',
  'Weighted Back Extension': 'Seated Leg Curl',
}

const ACCESS_EQUIPMENT: Record<NonNullable<Profile['access']>, string[]> = {
  full: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'],
  basic: ['dumbbell', 'machine', 'bodyweight', 'other'],
  home: ['dumbbell', 'bodyweight'],
  body: ['bodyweight'],
}

function banned(profile: Profile): Set<string> {
  const out = new Set<string>()
  for (const joint of profile.sore ?? []) {
    for (const name of SORE_BANS[joint] ?? []) out.add(name)
  }
  for (const name of profile.dislikes ?? []) out.add(name)
  return out
}

function allowed(profile: Profile, name: string, bans: Set<string>): boolean {
  if (bans.has(name)) return false
  const kit = ACCESS_EQUIPMENT[profile.access ?? 'full']
  return kit.includes(equipmentOf(name))
}

// Swap rather than drop: find the nearest movement in the same muscle group
// that this person can actually do, and is not already in the session.
function alternative(name: string, profile: Profile, bans: Set<string>, used: Set<string>): string | null {
  const first = PREFERRED[name]
  if (first && !used.has(first) && allowed(profile, first, bans)) return first

  const group = groupOf(name)
  if (!group) return null
  const type = lookupType(name)
  const pool = LIBRARY.filter(
    (e) => e.group === group && !used.has(e.name) && allowed(profile, e.name, bans),
  )
  return (pool.find((e) => e.type === type) ?? pool[0])?.name ?? null
}

export interface PlannedItem extends CustomWorkoutItem {
  swappedFrom?: string
}

// How many movements fit in the time they said they had.
const BUDGET: Record<number, number> = { 30: 4, 45: 6, 60: 8, 75: 10 }

export function buildDay(day: TemplateDay, profile: Profile): PlannedItem[] {
  const bans = banned(profile)
  const used = new Set<string>()
  const out: PlannedItem[] = []

  // A swap keeps the superset tag: the pattern stays in the circuit even when
  // the movement changes.
  for (const item of dayItems(day)) {
    if (allowed(profile, item.name, bans)) {
      used.add(item.name)
      out.push({ name: item.name, type: item.type, superset: item.superset ?? null })
      continue
    }
    const swap = alternative(item.name, profile, bans, used)
    if (!swap) continue
    used.add(swap)
    out.push({
      name: swap,
      type: (lookupType(swap) ?? 'W') as SetType,
      superset: item.superset ?? null,
      swappedFrom: item.name,
    })
  }

  const cap = BUDGET[profile.minutes ?? 60] ?? 8
  if (out.length <= cap) return out

  // The cap never slices through a superset: half a circuit is not a circuit.
  // Tagged groups are kept whole while at least two other movements still fit,
  // otherwise the whole group is dropped and singles fill the day.
  const groups = new Map<string, PlannedItem[]>()
  for (const item of out) {
    if (!item.superset) continue
    if (!groups.has(item.superset)) groups.set(item.superset, [])
    groups.get(item.superset)!.push(item)
  }

  const kept = new Set<string>()
  let reserved = 0
  for (const [tag, members] of groups) {
    if (reserved + members.length <= cap - 2) {
      kept.add(tag)
      reserved += members.length
    }
  }

  const trimmed: PlannedItem[] = []
  let singles = 0
  for (const item of out) {
    if (item.superset) {
      if (kept.has(item.superset)) trimmed.push(item)
      continue
    }
    if (singles < cap - reserved) {
      trimmed.push(item)
      singles += 1
    }
  }
  return trimmed
}

export interface Plan {
  level: Level
  days: number
  capped: boolean
  splitName: string
  dayIds: string[]
  perMuscle: string
  exercises: number
  reps: string
  sets: string
  showRpe: boolean
  cleared: boolean
}

export function planFor(profile: Profile, goal: Goal): Plan {
  const lv = level(profile)
  const asked = profile.days ?? 3
  const days = Math.min(Math.max(asked, 2), 5)
  return {
    level: lv,
    days,
    capped: asked > 5,
    splitName: SPLIT_NAME[lv][days],
    dayIds: TABLE[lv][days],
    perMuscle: days <= 2 ? '4 to 5' : days <= 3 ? '3 to 4' : '2 to 3',
    exercises: BUDGET[profile.minutes ?? 60] ?? 8,
    reps: goal === 'strength' ? '3 to 6' : goal === 'endurance' ? '12 to 20' : '6 to 12',
    sets: lv === 'Beginner' || profile.age === 'over60' ? '2 to 3' : '3 to 4',
    showRpe: lv === 'Intermediate' || lv === 'Advanced',
    cleared: profile.condition === 'yes' || profile.symptoms === 'yes',
  }
}

// The RPE box stays hidden until the number would mean something. Beginners
// underpredict how close to failure they are by 4 to 5 reps.
export function showRpe(profile: Profile, onboarded: boolean): boolean {
  if (!onboarded) return true
  return planFor(profile, 'muscle').showRpe
}

// The four week check-in, on a rolling window rather than the first month
// ever, so imported history cannot trigger it and a strong recent month
// clears a weak start. trainedLast28 is distinct training days in the last 28.
// It fires at most once: answering it, either way, stamps the profile.
export function needsCheckin(
  profile: Profile,
  onboardedAt: string | null,
  trainedLast28: number,
  today: string,
): boolean {
  if (!onboardedAt || profile.checkinDismissedAt) return false
  if ((profile.days ?? 3) < 3) return false
  const elapsed = new Date(today + 'T00:00:00').getTime() - new Date(onboardedAt).getTime()
  if (elapsed < 28 * 86400000) return false
  return trainedLast28 < 8
}
