'use client'

import { useEffect, useState } from 'react'
import { coach } from '@/lib/coach'
import { fmtDate, fmtSets, isEmptySet, topSet, uid } from '@/lib/format'
import SetRow from './SetRow'
import type { Exercise, Goal, SetEntry } from '@/lib/types'

export interface LastSession {
  date: string
  exercise: Exercise
}

// Carries the weight forward: last set of this exercise, else the top set of
// the last session.
function seedSet(exercise: Exercise, last: LastSession | null): SetEntry {
  const previous = exercise.sets[exercise.sets.length - 1]
  const source = previous && !isEmptySet(previous, exercise.type) ? previous : last ? topSet(last.exercise) : null
  return {
    id: uid(),
    w: source?.w ?? null,
    r: null,
    rpe: null,
    t: null,
    d: null,
    raw: null,
  }
}

export default function ExerciseBlock({
  exercise,
  goal,
  last,
  onChange,
  onRemove,
}: {
  exercise: Exercise
  goal: Goal
  last: LastSession | null
  onChange: (next: Exercise) => void
  onRemove: () => void
}) {
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!confirm) return
    const timer = setTimeout(() => setConfirm(false), 3000)
    return () => clearTimeout(timer)
  }, [confirm])

  const filled = exercise.sets.filter((s) => !isEmptySet(s, exercise.type))
  const basis = filled.length ? filled[filled.length - 1] : last ? topSet(last.exercise) ?? undefined : undefined
  const advice = coach(basis, exercise.type, goal)
  const fromLast = filled.length === 0 && !!basis

  function patchSet(id: string, patch: Partial<SetEntry>) {
    onChange({ ...exercise, sets: exercise.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }

  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-edge">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{exercise.name}</h3>
          {last ? (
            <p className="mt-0.5 truncate text-xs text-muted num">
              {fmtDate(last.date)} &middot; {fmtSets(last.exercise)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">First time logging this</p>
          )}
        </div>
        <button
          onClick={() => (confirm ? onRemove() : setConfirm(true))}
          className={`shrink-0 rounded-lg px-2 py-1 text-xs ${confirm ? 'bg-accent text-ink' : 'text-muted'}`}
        >
          {confirm ? 'Sure?' : 'Remove'}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {exercise.sets.map((set, i) => (
          <SetRow
            key={set.id}
            index={i}
            set={set}
            type={exercise.type}
            onChange={(patch) => patchSet(set.id, patch)}
            onRemove={() => onChange({ ...exercise, sets: exercise.sets.filter((s) => s.id !== set.id) })}
          />
        ))}
      </div>

      {advice ? (
        <p className="mt-2 text-xs text-accent">
          {fromLast ? 'Next set, ' : ''}
          {advice}
        </p>
      ) : null}

      <button
        onClick={() => onChange({ ...exercise, sets: [...exercise.sets, seedSet(exercise, last)] })}
        className="mt-3 w-full rounded-xl bg-ink py-2 text-sm text-muted ring-1 ring-edge"
      >
        Add set
      </button>
    </div>
  )
}
