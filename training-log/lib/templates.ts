import { lookupType } from './exercises'
import type { CustomWorkoutItem } from './types'

export interface TemplateDay {
  id: string
  name: string
  exercises: string[]
}

export interface TemplateSplit {
  id: string
  name: string
  note: string
  days: TemplateDay[]
}

// Baked into every day of the summer and five day splits.
const CORE = ['Hanging Leg Raise', 'Cable Crunch', 'Pallof Press', 'Plank']

// Knee note: the summer and five day splits carry no barbell back squat and no
// heavy hinge. Quad and hamstring work runs through machines and split stance.
export const SPLITS: TemplateSplit[] = [
  {
    id: 'summer4',
    name: 'Summer 4 Day',
    note: 'Four days, core circuit on every day',
    days: [
      {
        id: 'summer4-push',
        name: 'Push',
        exercises: [
          'Incline Dumbbell Press',
          'Machine Chest Press',
          'Seated Dumbbell Press',
          'Cable Fly',
          'Lateral Raise',
          'Rope Pushdown',
          'Overhead Cable Extension',
          ...CORE,
        ],
      },
      {
        id: 'summer4-pull',
        name: 'Pull',
        exercises: [
          'Weighted Pull Up',
          'Chest Supported Row',
          'Seated Cable Row',
          'Straight Arm Pulldown',
          'Face Pull',
          'Incline Dumbbell Curl',
          'Hammer Curl',
          ...CORE,
        ],
      },
      {
        id: 'summer4-legs',
        name: 'Legs',
        exercises: [
          'Leg Press',
          'Seated Leg Curl',
          'Leg Extension',
          'Bulgarian Split Squat',
          'Hip Thrust',
          'Standing Calf Raise',
          ...CORE,
        ],
      },
      {
        id: 'summer4-upper',
        name: 'Upper Mix',
        exercises: [
          'Incline Barbell Bench Press',
          'Single Arm Cable Row',
          'Machine Shoulder Press',
          'Cable Lateral Raise',
          'Reverse Pec Deck',
          'Cable Curl',
          'Triceps Pushdown',
          ...CORE,
        ],
      },
    ],
  },
  {
    id: 'five',
    name: '5 Day',
    note: 'Rest of year, core circuit on every day',
    days: [
      {
        id: 'five-chest',
        name: 'Chest and Triceps',
        exercises: [
          'Incline Dumbbell Press',
          'Machine Chest Press',
          'Incline Machine Press',
          'Cable Fly',
          'Weighted Dip',
          'Rope Pushdown',
          'Skull Crusher',
          ...CORE,
        ],
      },
      {
        id: 'five-back',
        name: 'Back and Biceps',
        exercises: [
          'Weighted Pull Up',
          'Chest Supported Row',
          'Wide Grip Lat Pulldown',
          'Single Arm Cable Row',
          'Straight Arm Pulldown',
          'Incline Dumbbell Curl',
          'Cable Curl',
          ...CORE,
        ],
      },
      {
        id: 'five-legs',
        name: 'Legs',
        exercises: [
          'Leg Press',
          'Seated Leg Curl',
          'Leg Extension',
          'Bulgarian Split Squat',
          'Hip Thrust',
          'Seated Calf Raise',
          ...CORE,
        ],
      },
      {
        id: 'five-shoulders',
        name: 'Shoulders and Arms',
        exercises: [
          'Seated Dumbbell Press',
          'Cable Lateral Raise',
          'Leaning Lateral Raise',
          'Reverse Pec Deck',
          'Face Pull',
          'Hammer Curl',
          'Overhead Cable Extension',
          ...CORE,
        ],
      },
      {
        id: 'five-pump',
        name: 'Upper Pump',
        exercises: [
          'Incline Barbell Bench Press',
          'Seated Cable Row',
          'Machine Shoulder Press',
          'Pec Deck',
          'Machine Row',
          'Preacher Curl',
          'V Bar Pushdown',
          ...CORE,
        ],
      },
    ],
  },
  {
    id: 'bro',
    name: 'Bro Split',
    note: 'One muscle group a day, five days',
    days: [
      {
        id: 'bro-chest',
        name: 'Chest',
        exercises: [
          'Barbell Bench Press',
          'Incline Dumbbell Press',
          'Machine Chest Press',
          'Cable Fly',
          'Pec Deck',
          'Weighted Dip',
        ],
      },
      {
        id: 'bro-back',
        name: 'Back',
        exercises: [
          'Pull Up',
          'Barbell Row',
          'Lat Pulldown',
          'Seated Cable Row',
          'Straight Arm Pulldown',
          'Barbell Shrug',
        ],
      },
      {
        id: 'bro-shoulders',
        name: 'Shoulders',
        exercises: [
          'Overhead Press',
          'Seated Dumbbell Press',
          'Lateral Raise',
          'Cable Lateral Raise',
          'Reverse Pec Deck',
          'Face Pull',
        ],
      },
      {
        id: 'bro-arms',
        name: 'Arms',
        exercises: [
          'Barbell Curl',
          'Incline Dumbbell Curl',
          'Hammer Curl',
          'Close Grip Bench Press',
          'Rope Pushdown',
          'Overhead Cable Extension',
        ],
      },
      {
        id: 'bro-legs',
        name: 'Legs',
        exercises: [
          'Back Squat',
          'Romanian Deadlift',
          'Leg Press',
          'Lying Leg Curl',
          'Leg Extension',
          'Standing Calf Raise',
        ],
      },
    ],
  },
  {
    id: 'ppl',
    name: 'Push Pull Legs',
    note: 'Three days, run once or twice a week',
    days: [
      {
        id: 'ppl-push',
        name: 'Push',
        exercises: [
          'Barbell Bench Press',
          'Seated Dumbbell Press',
          'Incline Dumbbell Press',
          'Lateral Raise',
          'Rope Pushdown',
          'Overhead Cable Extension',
        ],
      },
      {
        id: 'ppl-pull',
        name: 'Pull',
        exercises: [
          'Pull Up',
          'Barbell Row',
          'Lat Pulldown',
          'Face Pull',
          'Barbell Curl',
          'Hammer Curl',
        ],
      },
      {
        id: 'ppl-legs',
        name: 'Legs',
        exercises: [
          'Back Squat',
          'Romanian Deadlift',
          'Leg Press',
          'Seated Leg Curl',
          'Leg Extension',
          'Standing Calf Raise',
        ],
      },
    ],
  },
  {
    id: 'ul',
    name: 'Upper Lower',
    note: 'Four days, two upper and two lower',
    days: [
      {
        id: 'ul-upper-a',
        name: 'Upper A',
        exercises: [
          'Barbell Bench Press',
          'Barbell Row',
          'Seated Dumbbell Press',
          'Lat Pulldown',
          'Barbell Curl',
          'Rope Pushdown',
        ],
      },
      {
        id: 'ul-lower-a',
        name: 'Lower A',
        exercises: [
          'Back Squat',
          'Romanian Deadlift',
          'Leg Extension',
          'Seated Leg Curl',
          'Standing Calf Raise',
          'Hanging Leg Raise',
        ],
      },
      {
        id: 'ul-upper-b',
        name: 'Upper B',
        exercises: [
          'Incline Dumbbell Press',
          'Weighted Pull Up',
          'Machine Chest Press',
          'Seated Cable Row',
          'Cable Lateral Raise',
          'Incline Dumbbell Curl',
        ],
      },
      {
        id: 'ul-lower-b',
        name: 'Lower B',
        exercises: [
          'Leg Press',
          'Bulgarian Split Squat',
          'Lying Leg Curl',
          'Hip Thrust',
          'Seated Calf Raise',
          'Cable Crunch',
        ],
      },
    ],
  },
  {
    id: 'fb',
    name: 'Full Body',
    note: 'Three days, everything every session',
    days: [
      {
        id: 'fb-a',
        name: 'Full Body A',
        exercises: [
          'Back Squat',
          'Barbell Bench Press',
          'Barbell Row',
          'Lateral Raise',
          'Cable Curl',
          'Plank',
        ],
      },
      {
        id: 'fb-b',
        name: 'Full Body B',
        exercises: [
          'Romanian Deadlift',
          'Overhead Press',
          'Lat Pulldown',
          'Leg Press',
          'Rope Pushdown',
          'Hanging Leg Raise',
        ],
      },
      {
        id: 'fb-c',
        name: 'Full Body C',
        exercises: [
          'Leg Press',
          'Incline Dumbbell Press',
          'Seated Cable Row',
          'Seated Leg Curl',
          'Hammer Curl',
          'Cable Crunch',
        ],
      },
    ],
  },
]

export function dayItems(day: TemplateDay): CustomWorkoutItem[] {
  return day.exercises.map((name) => ({ name, type: lookupType(name) ?? 'W' }))
}
