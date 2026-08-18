'use client'

import { useState } from 'react'
import { buildDay, dayById, planFor, type Profile } from '@/lib/onboarding'
import type { Goal } from '@/lib/types'

type Answer = string | number

interface Question {
  id: string
  kicker?: string
  q: string
  sub?: string
  key: keyof Profile | 'goalChoice'
  opts: { v: Answer; label: string; note?: string }[]
  when?: (p: Profile, g: string | null) => boolean
}

// Tier 0 is the health gate, tier 1 is the four that produce a plan. Everything
// else waits until the app has earned it. docs/onboarding-research.md has the why.
const QUESTIONS: Question[] = [
  {
    id: 'condition',
    kicker: 'Two questions, then we are done with this',
    q: 'Has a doctor ever told you to limit exercise, or do you have a heart, lung, kidney or blood sugar condition?',
    key: 'condition',
    opts: [
      { v: 'no', label: 'No' },
      { v: 'yes', label: 'Yes' },
      { v: 'skip', label: 'Rather not say' },
    ],
  },
  {
    id: 'symptoms',
    q: 'When you push yourself, do you get chest pain, dizziness, blackouts or breathlessness out of proportion to the effort?',
    key: 'symptoms',
    opts: [
      { v: 'no', label: 'No' },
      { v: 'yes', label: 'Yes' },
    ],
  },
  {
    id: 'years',
    kicker: 'Four questions and you are training',
    q: 'How long have you been lifting, without a break longer than a month?',
    key: 'years',
    opts: [
      { v: 'never', label: 'Never done it' },
      { v: 'under6', label: 'Under 6 months' },
      { v: 'sixToTwo', label: '6 months to 2 years' },
      { v: 'overTwo', label: 'Over 2 years' },
    ],
  },
  {
    id: 'before',
    q: 'Have you trained seriously in the past?',
    key: 'before',
    when: (p) => p.years === 'never' || p.years === 'under6',
    opts: [
      { v: 'no', label: 'No, this is new' },
      { v: 'thisYear', label: 'Yes, within the last year' },
      { v: 'longAgo', label: 'Yes, longer ago than that' },
    ],
  },
  {
    id: 'days',
    q: 'Realistically, how many days a week will you get there?',
    key: 'days',
    opts: [
      { v: 2, label: '2 days', note: 'Enough to make progress. Genuinely.' },
      { v: 3, label: '3 days', note: 'The sweet spot for most people' },
      { v: 4, label: '4 days' },
      { v: 5, label: '5 days' },
      { v: 6, label: '6 days', note: 'Only if you have done it before' },
    ],
  },
  {
    id: 'goal',
    q: 'What is this for?',
    key: 'goalChoice',
    opts: [
      { v: 'muscle', label: 'Build muscle' },
      { v: 'strength', label: 'Get stronger' },
      { v: 'lean', label: 'Lean out' },
      { v: 'health', label: 'Stay healthy and capable' },
    ],
  },
  {
    id: 'access',
    q: 'Where are you training?',
    key: 'access',
    opts: [
      { v: 'full', label: 'Full gym' },
      { v: 'basic', label: 'Basic gym', note: 'Dumbbells, benches, a few machines' },
      { v: 'home', label: 'Home with some kit' },
      { v: 'body', label: 'Bodyweight only' },
    ],
  },
]

const GOAL_MAP: Record<string, Goal> = {
  muscle: 'muscle',
  strength: 'strength',
  lean: 'muscle',
  health: 'muscle',
}

export default function Onboarding({
  onFinish,
}: {
  onFinish: (profile: Profile, goal: Goal, startDayId: string | null) => void
}) {
  const [step, setStep] = useState(-1)
  const [profile, setProfile] = useState<Profile>({})
  const [goalChoice, setGoalChoice] = useState<string | null>(null)

  const live = QUESTIONS.filter((q) => !q.when || q.when(profile, goalChoice))
  const question = step >= 0 && step < live.length ? live[step] : null
  const onPlan = step >= live.length
  const goal = GOAL_MAP[goalChoice ?? 'muscle'] ?? 'muscle'

  function answer(q: Question, v: Answer) {
    if (q.key === 'goalChoice') setGoalChoice(String(v))
    else setProfile((prev) => ({ ...prev, [q.key]: v }) as Profile)
    setStep((s) => s + 1)
  }

  function finish(startDayId: string | null) {
    onFinish({ ...profile, goalChoice: goalChoice ?? undefined } as Profile, goal, startDayId)
  }

  // Welcome
  if (step === -1) {
    return (
      <Frame>
        <div className="flex-1" />
        <h1 className="text-3xl font-semibold tracking-tight">Training Log</h1>
        <p className="mt-3 text-sm text-muted">
          Log every set. See what you did last time on the line above the inputs. Know what to do next.
        </p>
        <p className="mt-4 text-sm text-muted">
          Six taps and you have a session to start. Skip any of them and we will pick something sensible.
        </p>
        <div className="flex-1" />
        <div className="flex gap-2 pb-2">
          <button
            onClick={() => setStep(0)}
            className="flex-1 rounded-2xl bg-accent py-4 text-base font-medium text-on-accent"
          >
            Set me up
          </button>
          <button onClick={() => finish(null)} className="rounded-2xl px-5 py-4 text-base text-muted">
            Skip
          </button>
        </div>
      </Frame>
    )
  }

  // The plan
  if (onPlan) {
    const plan = planFor(profile, goal)
    const days = plan.dayIds.map((id) => dayById(id)).filter(Boolean)
    const first = plan.dayIds[0]
    const swaps = days[0] ? buildDay(days[0]!, profile).filter((i) => i.swappedFrom) : []

    const notes: string[] = []
    if (plan.capped)
      notes.push(
        'You said 6 days. We have put 5 in front of you, because the week that goes wrong is the week you miss all six. Add the sixth whenever you want it.',
      )
    if (plan.cleared)
      notes.push(
        'You flagged something on the health questions, so this starts lighter and nothing here goes to failure. Worth a word with your doctor before you push hard.',
      )
    if (plan.level === 'Returner')
      notes.push('You have done this before, so this is two to three weeks of rebuilding, not a beginner course.')
    if (!plan.showRpe)
      notes.push(
        'No RPE box yet. Add a rep or a little load when the last set felt like you had two left. We will turn the effort scale on when it will mean something.',
      )
    if (goalChoice === 'lean')
      notes.push('Leaning out: this holds and builds the muscle, the kitchen does the rest.')
    if (swaps.length)
      notes.push(`Swapped for what you have: ${swaps.map((s) => `${s.swappedFrom} to ${s.name}`).join(', ')}.`)

    return (
      <Frame>
        <p className="text-xs uppercase tracking-wide text-muted">Your plan</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {plan.splitName}, {plan.days} days a week
        </h1>
        <p className="mt-1 text-sm text-muted">
          {plan.reps} reps · {plan.sets} sets per exercise
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {days.map((d, i) => (
            <div
              key={d!.id}
              className="flex items-center justify-between rounded-xl bg-card px-3 py-3 ring-1 ring-edge"
            >
              <span className="text-sm">{d!.name}</span>
              <span className="text-xs text-muted num">day {i + 1}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-2xl bg-card p-3 ring-1 ring-edge">
          <Row label="Sets per muscle, per session" value={plan.perMuscle} />
          <Row label="Weekly target per muscle" value="10 plus" />
          <Row label="Exercises per session" value={String(plan.exercises)} />
          <Row label="How hard" value={plan.cleared ? 'comfortable' : 'stop 2 to 3 short'} />
          <Row label="Effort scale" value={plan.showRpe ? 'RPE on' : 'hidden for now'} />
        </div>

        {notes.map((n) => (
          <p key={n} className="mt-3 border-l-2 border-accent pl-3 text-xs leading-relaxed text-muted">
            {n}
          </p>
        ))}

        <div className="flex-1 min-h-4" />
        <div className="flex gap-2 pb-2">
          <button
            onClick={() => finish(first)}
            className="flex-1 rounded-2xl bg-accent py-4 text-base font-medium text-on-accent"
          >
            Start day 1
          </button>
          <button onClick={() => finish(null)} className="rounded-2xl px-5 py-4 text-base text-muted">
            Later
          </button>
        </div>
      </Frame>
    )
  }

  // A question
  const q = question!
  return (
    <Frame>
      <div className="flex items-center gap-2 pb-4">
        <button
          onClick={() => setStep((s) => s - 1)}
          className="rounded-lg px-2 py-1 text-sm text-muted"
          aria-label="Back"
        >
          &larr;
        </button>
        <div className="flex flex-1 gap-1">
          {live.map((item, i) => (
            <span
              key={item.id}
              className={`h-0.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-edge'}`}
            />
          ))}
        </div>
      </div>

      {q.kicker ? <p className="text-xs uppercase tracking-wide text-muted">{q.kicker}</p> : null}
      <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{q.q}</h1>
      {q.sub ? <p className="mt-2 text-sm text-muted">{q.sub}</p> : null}

      <div className="mt-6 flex flex-col gap-2">
        {q.opts.map((o) => (
          <button
            key={String(o.v)}
            onClick={() => answer(q, o.v)}
            className="rounded-2xl bg-card px-4 py-4 text-left ring-1 ring-edge"
          >
            <span className="text-base">{o.label}</span>
            {o.note ? <span className="mt-0.5 block text-xs text-muted">{o.note}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-4" />
      <button
        onClick={() => setStep((s) => s + 1)}
        className="pb-4 pt-3 text-sm text-muted"
      >
        Skip
      </button>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 pb-6 pt-8">{children}</main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-edge py-2 text-sm last:border-0 last:pb-0">
      <span>{label}</span>
      <span className="num text-muted">{value}</span>
    </div>
  )
}
