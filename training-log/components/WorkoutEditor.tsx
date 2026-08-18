'use client'

import { useEffect, useState } from 'react'
import { fmtDate, workoutVolume, uid } from '@/lib/format'
import ExerciseBlock, { type LastSession } from './ExerciseBlock'
import type { Bests } from '@/lib/gamify'
import { groupRuns, isSuperset, supersetLetter, supersetRest, type Run } from '@/lib/superset'
import { hardestFirst, isHardestFirst, moveRun } from '@/lib/order'
import type { Exercise, Goal, Workout } from '@/lib/types'

interface BlockExtras {
  nested: boolean
  restSeconds: number
  restOnComplete: boolean
}

export default function WorkoutEditor({
  workout,
  goal,
  showRpe,
  rpeBand,
  lastFor,
  bestsFor,
  live,
  onRest,
  loads,
  offerSort = false,
  onChange,
  onDelete,
  onAddExercise,
  showDate = false,
}: {
  workout: Workout
  goal: Goal
  showRpe: boolean
  rpeBand?: [number, number]
  lastFor: (name: string, workout: Workout) => LastSession | null
  bestsFor: (name: string, workout: Workout) => Bests
  live: boolean
  onRest: (exerciseId: string, name: string, seconds: number) => void
  loads: Map<string, number>
  offerSort?: boolean
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
  const sorted = !offerSort || isHardestFirst(workout.exercises, loads)

  const move = (exerciseId: string, direction: -1 | 1) =>
    onChange({ ...workout, exercises: moveRun(workout.exercises, exerciseId, direction) })

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
          className={`shrink-0 rounded-lg px-3 py-2 text-xs ${confirm ? 'bg-accent text-on-accent' : 'text-muted'}`}
        >
          {confirm ? 'Sure?' : 'Delete'}
        </button>
      </div>

      {workout.exercises.length > 1 && !sorted ? (
        <button
          onClick={() => onChange({ ...workout, exercises: hardestFirst(workout.exercises, loads) })}
          className="self-start rounded-lg bg-card px-3 py-1.5 text-xs text-muted ring-1 ring-edge"
        >
          Put the hardest first
        </button>
      ) : null}

      {showDate ? (
        <input
          type="date"
          value={workout.date}
          onChange={(e) => onChange({ ...workout, date: e.target.value })}
          className="w-full rounded-lg bg-card px-3 py-2 text-sm num outline-none ring-1 ring-edge focus:ring-accent"
        />
      ) : null}

      {(() => {
        const runs = groupRuns(workout.exercises)

        // Joining two neighbouring runs into one superset. Everything in both
        // runs takes a fresh shared tag, so linking a pair, or a single onto an
        // existing superset, is the same one tap.
        const link = (a: Run, b: Run) => {
          const tag = uid()
          const joined = new Set([...a.exercises, ...b.exercises].map((e) => e.id))
          onChange({
            ...workout,
            exercises: workout.exercises.map((e) =>
              joined.has(e.id) ? { ...e, superset: tag } : e,
            ),
          })
        }

        return runs.map((run, runIndex) => {
        const block = (exercise: Exercise, label?: string, extra?: Partial<BlockExtras>) => (
          <ExerciseBlock
            key={exercise.id}
            exercise={exercise}
            goal={goal}
            showRpe={showRpe}
            rpeBand={rpeBand}
            last={lastFor(exercise.name, workout)}
            bests={bestsFor(exercise.name, workout)}
            live={live}
            onRest={onRest}
            label={label}
            {...extra}
            onMove={(direction) => move(exercise.id, direction)}
            onChange={patchExercise}
            onRemove={() =>
              onChange({ ...workout, exercises: workout.exercises.filter((e) => e.id !== exercise.id) })
            }
          />
        )

        if (!isSuperset(run)) {
          return run.exercises.map((exercise) => block(exercise))
        }

        // One clock for the group, set by the movement that asks for the most.
        const rest = supersetRest(run, goal)
        const letter = supersetLetter(run.index)

        return (
          <div key={run.exercises[0].id} className="rounded-2xl bg-card p-2 ring-1 ring-accent">
            <div className="flex items-center justify-between px-2 pb-1 pt-1">
              <span className="text-xs uppercase tracking-wide text-accent">Superset {letter}</span>
              <button
                onClick={() =>
                  onChange({
                    ...workout,
                    exercises: workout.exercises.map((e) =>
                      e.superset === run.superset ? { ...e, superset: null } : e,
                    ),
                  })
                }
                className="text-xs text-muted"
              >
                Unlink
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {run.exercises.map((exercise, i) =>
                block(exercise, `${letter}${i + 1}`, {
                  nested: true,
                  restSeconds: rest,
                  restOnComplete: i === run.exercises.length - 1,
                }),
              )}
            </div>
            <p className="px-2 pb-1 pt-2 text-xs text-muted">
              Straight through, then rest. The clock starts after {letter}
              {run.exercises.length}.
            </p>
          </div>
        )
        }).flatMap((node, runIndex) => {
          if (runIndex === runs.length - 1) return [node]
          return [
            node,
            <div key={`link-${runs[runIndex].exercises[0].id}`} className="-my-1.5 flex justify-center">
              <button
                onClick={() => link(runs[runIndex], runs[runIndex + 1])}
                className="rounded-full bg-card px-3 py-0.5 text-xs text-muted ring-1 ring-edge"
              >
                Link
              </button>
            </div>,
          ]
        })
      })()}

      <button
        onClick={onAddExercise}
        className="rounded-xl border border-dashed border-edge py-3 text-sm text-muted"
      >
        Add exercise
      </button>
    </section>
  )
}
