'use client'

import { useMemo, useState } from 'react'
import { seriesFor, trackedNames } from '@/lib/progress'
import ProgressChart from './ProgressChart'
import type { Workout } from '@/lib/types'

const SHOWN = 3

export default function ProgressTab({ workouts }: { workouts: Workout[] }) {
  const [all, setAll] = useState(false)

  const series = useMemo(
    () => trackedNames(workouts).map((name) => seriesFor(workouts, name)).filter((s) => s !== null),
    [workouts],
  )

  if (!series.length) {
    return (
      <p className="rounded-2xl bg-card p-4 text-sm text-muted ring-1 ring-edge">
        Nothing to chart yet. A movement needs two sessions behind it before there is a line to draw.
      </p>
    )
  }

  const visible = all ? series : series.slice(0, SHOWN)

  return (
    <div className="flex flex-col gap-4">
      {visible.map((s) => (
        <ProgressChart key={s.name} series={s} />
      ))}

      {series.length > SHOWN ? (
        <button
          onClick={() => setAll((v) => !v)}
          className="rounded-xl bg-card py-3 text-sm text-muted ring-1 ring-edge"
        >
          {all ? 'Show the top three' : `Show all ${series.length} movements`}
        </button>
      ) : null}
    </div>
  )
}
