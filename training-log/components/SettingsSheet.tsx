'use client'

import { useState } from 'react'
import { GOALS } from '@/lib/coach'
import { toCsv } from '@/lib/csv'
import { today } from '@/lib/format'
import { importArtifactData } from '@/lib/importer'
import Sheet from './Sheet'
import type { Goal, TrainingData } from '@/lib/types'

export default function SettingsSheet({
  data,
  email,
  onGoal,
  onImport,
  onSignOut,
  onClose,
}: {
  data: TrainingData
  email: string
  onGoal: (goal: Goal) => void
  onImport: (data: TrainingData) => Promise<void>
  onSignOut: () => void
  onClose: () => void
}) {
  const [paste, setPaste] = useState('')
  const [status, setStatus] = useState('')

  function exportCsv() {
    const blob = new Blob([toCsv(data.workouts)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `training-log-${today()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function runImport() {
    setStatus('Reading')
    try {
      const parsed = importArtifactData(paste)
      if (!parsed.workouts.length && !parsed.custom.length && !parsed.customWorkouts.length) {
        setStatus('Nothing found in that paste')
        return
      }
      setStatus(`Writing ${parsed.workouts.length} workouts`)
      await onImport(parsed)
      setPaste('')
      setStatus('Imported')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not read that')
    }
  }

  return (
    <Sheet title="Settings" onClose={onClose}>
      <h3 className="text-xs uppercase tracking-wide text-muted">Goal</h3>
      <div className="mt-2 flex flex-col gap-2">
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => onGoal(g.id)}
            className={`flex items-center justify-between rounded-xl px-3 py-3 text-left ring-1 ${
              data.settings.goal === g.id ? 'bg-accent text-ink ring-accent' : 'bg-ink ring-edge'
            }`}
          >
            <span className="text-sm">{g.label}</span>
            <span className={`text-xs num ${data.settings.goal === g.id ? 'text-ink' : 'text-muted'}`}>
              {g.reps[0]} to {g.reps[1]} reps, RPE {g.rpe[0]} to {g.rpe[1]}
            </span>
          </button>
        ))}
      </div>

      <h3 className="mt-6 text-xs uppercase tracking-wide text-muted">Data</h3>
      <button onClick={exportCsv} className="mt-2 w-full rounded-xl bg-ink py-3 text-sm ring-1 ring-edge">
        Export CSV, one row per set
      </button>

      <p className="mt-4 text-xs text-muted">
        Bringing history over from the artifact build, paste the training-data-v2 blob here.
      </p>
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder='{"workouts":[ ... ]}'
        rows={4}
        className="mt-2 w-full rounded-xl bg-ink px-3 py-2 text-xs outline-none ring-1 ring-edge focus:ring-accent"
      />
      <button
        disabled={!paste.trim()}
        onClick={() => void runImport()}
        className="mt-2 w-full rounded-xl bg-ink py-3 text-sm ring-1 ring-edge disabled:opacity-40"
      >
        Import
      </button>
      {status ? <p className="mt-2 text-xs text-accent">{status}</p> : null}

      <h3 className="mt-6 text-xs uppercase tracking-wide text-muted">Account</h3>
      <p className="mt-2 text-sm text-muted">{email}</p>
      <button onClick={onSignOut} className="mt-2 w-full rounded-xl bg-ink py-3 text-sm ring-1 ring-edge">
        Sign out
      </button>
    </Sheet>
  )
}
