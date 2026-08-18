'use client'

import { COVERAGE_TARGET, trainingGrid, weeklyCoverage, weeklyStreak } from '@/lib/gamify'
import type { Workout } from '@/lib/types'

export default function StatsPanel({
  workouts,
  today,
  target,
}: {
  workouts: Workout[]
  today: string
  target: number
}) {
  const coverage = weeklyCoverage(workouts, today)
  const grid = trainingGrid(workouts, today)
  const streak = weeklyStreak(workouts, today, target)
  const month = grid.filter((d) => d.trained).length

  return (
    <div className="mb-4 flex flex-col gap-4">
      <div className="rounded-2xl bg-card p-4 ring-1 ring-edge">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-wide text-muted">Last 28 days</h2>
          <span className="text-xs text-muted num">{month} sessions</span>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {grid.map((day) => (
            <span
              key={day.date}
              title={day.date}
              className={`aspect-square rounded-sm ${day.trained ? 'bg-accent' : 'bg-ink ring-1 ring-edge'}`}
            />
          ))}
        </div>

        <p className="mt-3 text-sm">
          {streak > 0 ? (
            <>
              <span className="num text-accent">{streak}</span>
              <span className="text-muted">
                {' '}
                {streak === 1 ? 'week' : 'weeks'} running at {target} days or better
              </span>
            </>
          ) : (
            <span className="text-muted">
              Hit {target} days this week and the count starts. Rest days cost nothing.
            </span>
          )}
        </p>
      </div>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-edge">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-wide text-muted">This week, sets per muscle</h2>
          <span className="text-xs text-muted num">target {COVERAGE_TARGET}</span>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {coverage.map((g) => {
            const pct = Math.min(100, (g.sets / COVERAGE_TARGET) * 100)
            return (
              <div key={g.group} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-muted">{g.group}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink ring-1 ring-edge">
                  <span
                    className={`block h-full rounded-full ${g.sets >= COVERAGE_TARGET ? 'bg-accent' : 'bg-muted'}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-5 shrink-0 text-right text-xs num text-muted">{g.sets}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
