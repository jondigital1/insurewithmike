'use client'

import { useMemo, useState } from 'react'
import { LIBRARY, MUSCLE_GROUPS } from '@/lib/exercises'
import { uid } from '@/lib/format'
import { supersetLetter } from '@/lib/superset'
import Sheet from './Sheet'
import type { CustomExercise, CustomWorkoutItem } from '@/lib/types'

export default function CustomBuilder({
  customs,
  onSave,
  onClose,
}: {
  customs: CustomExercise[]
  onSave: (name: string, items: CustomWorkoutItem[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [picked, setPicked] = useState<CustomWorkoutItem[]>([])
  // While on, everything picked joins the same superset, exactly like the
  // picker in a live session. Off and on again starts a new group.
  const [superset, setSuperset] = useState<string | null>(null)

  const all = useMemo(
    () => [...customs.map((c) => ({ name: c.name, type: c.type, group: 'My exercises' })), ...LIBRARY],
    [customs],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((e) => {
      if (q) return e.name.toLowerCase().includes(q)
      if (group) return e.group === group
      return false
    })
  }, [all, query, group])

  function toggle(item: CustomWorkoutItem) {
    setPicked((prev) =>
      prev.some((p) => p.name === item.name)
        ? prev.filter((p) => p.name !== item.name)
        : [...prev, { name: item.name, type: item.type, superset }],
    )
  }

  // Letters for display: first superset A, second B, in order of appearance.
  const letters = new Map<string, string>()
  for (const p of picked) {
    if (p.superset && !letters.has(p.superset)) {
      letters.set(p.superset, supersetLetter(letters.size))
    }
  }

  const groups = customs.length ? ['My exercises', ...MUSCLE_GROUPS] : MUSCLE_GROUPS

  return (
    <Sheet title="Build a workout" onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Workout name"
        className="w-full rounded-xl bg-ink px-4 py-3 text-base outline-none ring-1 ring-edge focus:ring-accent"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => {
              setGroup(group === g ? null : g)
              setQuery('')
            }}
            className={`rounded-full px-3 py-1 text-xs ${group === g ? 'bg-accent text-on-accent' : 'bg-ink text-muted ring-1 ring-edge'}`}
          >
            {g}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Or search every movement"
        className="mt-3 w-full rounded-xl bg-ink px-4 py-3 text-base outline-none ring-1 ring-edge focus:ring-accent"
      />

      <button
        onClick={() => setSuperset(superset ? null : uid())}
        className={`mt-3 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left ring-1 ${
          superset ? 'bg-accent text-on-accent ring-accent' : 'bg-ink ring-edge'
        }`}
      >
        <span className="text-sm">Superset</span>
        <span className={`text-xs ${superset ? 'text-on-accent' : 'text-muted'}`}>
          {superset ? 'everything picked now runs together' : 'off'}
        </span>
      </button>

      {picked.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {picked.map((p) => (
            <button
              key={p.name}
              onClick={() => toggle(p)}
              className="rounded-full bg-accent px-3 py-1 text-xs text-on-accent"
            >
              {p.superset ? `${letters.get(p.superset)} · ` : ''}
              {p.name} &times;
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col">
        {results.map((e) => {
          const on = picked.some((p) => p.name === e.name)
          return (
            <button
              key={`${e.group}-${e.name}`}
              onClick={() => toggle(e)}
              className="flex items-center justify-between border-b border-edge py-3 text-left"
            >
              <span className="text-sm">{e.name}</span>
              <span className={`text-xs ${on ? 'text-accent' : 'text-muted'}`}>{on ? 'Added' : e.group}</span>
            </button>
          )
        })}
        {results.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Pick a muscle group or search</p>
        ) : null}
      </div>

      <button
        disabled={!name.trim() || picked.length === 0}
        onClick={() => onSave(name.trim(), picked)}
        className="sticky bottom-0 mt-4 w-full rounded-xl bg-accent py-3 text-sm font-medium text-on-accent disabled:opacity-40"
      >
        Save workout
      </button>
    </Sheet>
  )
}
