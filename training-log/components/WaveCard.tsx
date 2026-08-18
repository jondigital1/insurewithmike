'use client'

import { readWave, WAVE, type WaveWeek } from '@/lib/wave'
import type { Workout } from '@/lib/types'

export default function WaveCard({
  week,
  workouts,
  today,
}: {
  week: WaveWeek
  workouts: Workout[]
  today: string
}) {
  const read = readWave(workouts, week, today)
  const [lo, hi] = week.rpe

  return (
    <div className="mb-4 rounded-2xl bg-card p-4 ring-1 ring-edge">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wide text-muted">Effort wave</h2>
        <span className="text-xs text-muted num">week {week.index} of 3</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-lg font-semibold tracking-tight">{week.name}</span>
        <span className="text-sm text-accent">{week.rir}</span>
      </div>

      <div className="mt-3 flex gap-1.5">
        {WAVE.map((w) => (
          <span
            key={w.index}
            className={`h-1.5 flex-1 rounded-full ${w.index === week.index ? 'bg-accent' : 'bg-edge'}`}
          />
        ))}
      </div>

      <p className="mt-3 text-sm text-muted">{week.note}</p>

      <div className="mt-3 flex items-center justify-between border-t border-edge pt-3 text-sm">
        <span className="text-muted">
          Aim RPE <span className="num text-bright">{lo} to {hi}</span>
        </span>
        {read.average == null ? (
          <span className="text-xs text-muted">no RPE logged yet</span>
        ) : (
          <span className="num">
            <span
              className={read.verdict === 'on' ? 'text-bright' : 'text-accent'}
            >
              {read.average}
            </span>
            <span className="ml-2 text-xs text-muted">
              {read.verdict === 'on'
                ? 'on target'
                : read.verdict === 'under'
                  ? 'easier than the week asks'
                  : 'harder than the week asks'}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
