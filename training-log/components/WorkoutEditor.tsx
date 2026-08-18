'use client'

import { useEffect, useState } from 'react'
import { fmtDate, workoutVolume } from '@/lib/format'
import ExerciseBlock, { type LastSession } from './ExerciseBlock'
import type { Exercise, Goal, Workout } from '@/lib/types'

export default function WorkoutEditor({
  workout,
  goal,
  lastFor,
  onChange,
  onDelete,
  onAddExercise,
  showDate = false,
}: {
  workout: Workout
  goal: Goal
  lastFor: (name: string, workout: Workout) => LastSession | null
  onChange: (next: Workout) => void
  onDelete: () => void
  onAddExercise: () => void
  showDate?: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    if (!confirm) return
    const timer = setTimeout(() => setConfirm(false), 3000)
    return () => clearTimeout(timer)
  }, [confirm])

  function patchExercise(next: Exercise) {
    onChange({ ...workout, exercises: workout.exercises.map((e) => (e.id === next.id ? next : e)) })
  }

  const volume = workoutVolume(workout)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            value={workout.title}
            onChange={(e) => onChange({ ...workout, title: e.target.value })}
            onBlur={() => setRenaming(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setRenaming(false)
            }}
            className="flex-1 rounded-lg bg-card px-3 py-2 text-base outline-none ring-1 ring-accent"
          />
        ) : (
          <button onClick={() => setRenaming(true)} className="min-w-0 flex-1 text-left">
            <h2 className="truncate text-lg font-semibold tracking-tight">{workout.title}</h2>
            <p className="text-xs text-muted num">
              {fmtDate(workout.date)}
              {workout.exercises.length ? ` · ${workout.exercises.length} exercises` : ''}
              {volume > 0 ? ` · ${Math.round(volume).toLocaleString()} lb` : ''}
            </p>
          </button>
        )}
        <button
          onClick={() => (confirm ? onDelete() : setConfirm(true))}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs ${confirm ? 'bg-accent text-ink' : 'text-muted'}`}
        >
          {confirm ? 'Sure?' : 'Delete'}
        </button>
      </div>

      {showDate ? (
        <input
          type="date"
          value={workout.date}
          onChange={(e) => onChange({ ...workout, date: e.target.value })}
          className="w-full rounded-lg bg-card px-3 py-2 text-sm num outline-none ring-1 ring-edge focus:ring-accent"
        />
      ) : null}

      {workout.exercises.map((exercise) => (
        <ExerciseBlock
          key={exercise.id}
          exercise={exercise}
          goal={goal}
          last={lastFor(exercise.name, workout)}
          onChange={patchExercise}
          onRemove={() =>
            onChange({ ...workout, exercises: workout.exercises.filter((e) => e.id !== exercise.id) })
          }
        />
      ))}

      <button
        onClick={onAddExercise}
        className="rounded-xl border border-dashed border-edge py-3 text-sm text-muted"
      >
        Add exercise
      </button>
    </section>
  )
}
