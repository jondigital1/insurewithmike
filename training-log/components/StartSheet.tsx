'use client'

import { useEffect, useState } from 'react'
import { SPLITS, dayItems, dayNames } from '@/lib/templates'
import { buildDay, dayById, type Plan, type Profile } from '@/lib/onboarding'
import Sheet from './Sheet'
import type { CustomWorkout, CustomWorkoutItem } from '@/lib/types'

export default function StartSheet({
  plan,
  profile,
  customWorkouts,
  onStart,
  onBuild,
  onDelete,
  onClose,
}: {
  plan: Plan | null
  profile: Profile
  customWorkouts: CustomWorkout[]
  onStart: (title: string, items: CustomWorkoutItem[], sort?: boolean, dayId?: string) => void
  onBuild: () => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [openSplit, setOpenSplit] = useState<string | null>(SPLITS[0].id)
  const [confirm, setConfirm] = useState<string | null>(null)

  useEffect(() => {
    if (!confirm) return
    const timer = setTimeout(() => setConfirm(null), 3000)
    return () => clearTimeout(timer)
  }, [confirm])

  const planDays = (plan?.dayIds ?? []).map((id) => dayById(id)).filter(Boolean)

  return (
    <Sheet title="Start a workout" onClose={onClose}>
      {planDays.length ? (
        <div className="mb-5">
          <h3 className="text-xs uppercase tracking-wide text-muted">
            Your plan &middot; {plan!.splitName}
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {planDays.map((day, i) => (
              <button
                key={day!.id}
                onClick={() => onStart(day!.name, buildDay(day!, profile), true, day!.id)}
                className="flex items-center justify-between rounded-xl bg-ink px-3 py-3 text-left ring-1 ring-edge"
              >
                <span className="text-sm">{day!.name}</span>
                <span className="text-xs text-muted num">day {i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          onClick={() => onStart('Workout', [])}
          className="flex-1 rounded-xl bg-ink py-3 text-sm ring-1 ring-edge"
        >
          Empty workout
        </button>
        <button onClick={onBuild} className="flex-1 rounded-xl bg-ink py-3 text-sm ring-1 ring-edge">
          Build one
        </button>
      </div>

      {customWorkouts.length ? (
        <div className="mt-5">
          <h3 className="text-xs uppercase tracking-wide text-muted">My workouts</h3>
          <div className="mt-2 flex flex-col gap-2">
            {customWorkouts.map((w) => (
              <div key={w.id} className="flex items-center gap-2">
                <button
                  onClick={() => onStart(w.name, w.items)}
                  className="flex-1 rounded-xl bg-ink px-3 py-3 text-left ring-1 ring-edge"
                >
                  <span className="text-sm">{w.name}</span>
                  <span className="ml-2 text-xs text-muted num">{w.items.length}</span>
                </button>
                <button
                  onClick={() => (confirm === w.id ? onDelete(w.id) : setConfirm(w.id))}
                  className={`rounded-xl px-3 py-3 text-xs ${confirm === w.id ? 'bg-accent text-on-accent' : 'text-muted'}`}
                >
                  {confirm === w.id ? 'Sure?' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-xs uppercase tracking-wide text-muted">Templates</h3>
        <div className="mt-2 flex flex-col gap-2">
          {SPLITS.map((split) => (
            <div key={split.id} className="rounded-xl bg-ink ring-1 ring-edge">
              <button
                onClick={() => setOpenSplit(openSplit === split.id ? null : split.id)}
                className="flex w-full items-center justify-between px-3 py-3 text-left"
              >
                <span>
                  <span className="text-sm">{split.name}</span>
                  <span className="ml-2 text-xs text-muted">{split.note}</span>
                </span>
                <span className="text-xs text-muted num">{split.days.length}</span>
              </button>
              {openSplit === split.id ? (
                <div className="flex flex-col border-t border-edge">
                  {split.days.map((day) => (
                    <button
                      key={day.id}
                      onClick={() => onStart(`${split.name} ${day.name}`, dayItems(day))}
                      className="flex items-center justify-between px-3 py-3 text-left"
                    >
                      <span className="text-sm text-bright">{day.name}</span>
                      <span className="truncate pl-3 text-xs text-muted">
                        {dayNames(day).slice(0, 2).join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
