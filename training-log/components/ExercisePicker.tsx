'use client'

import { useMemo, useState } from 'react'
import { LIBRARY, MUSCLE_GROUPS } from '@/lib/exercises'
import { uid } from '@/lib/format'
import Sheet from './Sheet'
import { SET_TYPES, type CustomExercise, type SetType } from '@/lib/types'

export default function ExercisePicker({
  customs,
  onPick,
  onCreate,
  onClose,
}: {
  customs: CustomExercise[]
  onPick: (name: string, type: SetType) => void
  onCreate: (exercise: CustomExercise) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const [newType, setNewType] = useState<SetType>('W')

  const all = useMemo(
    () => [...customs.map((c) => ({ name: c.name, type: c.type, group: 'My exercises' })), ...LIBRARY],
    [customs],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((e) => {
      if (group && e.group !== group) return false
      if (!q) return true
      return e.name.toLowerCase().includes(q)
    })
  }, [all, query, group])

  const exact = all.some((e) => e.name.toLowerCase() === query.trim().toLowerCase())

  function pick(name: string, type: SetType) {
    onPick(name, type)
    setAdded((prev) => [...prev, name])
  }

  const groups = customs.length ? ['My exercises', ...MUSCLE_GROUPS] : MUSCLE_GROUPS

  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search movements"
        className="w-full rounded-xl bg-ink px-4 py-3 text-base outline-none ring-1 ring-edge focus:ring-accent"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setGroup(null)}
          className={`rounded-full px-3 py-1 text-xs ${group === null ? 'bg-accent text-ink' : 'bg-ink text-muted ring-1 ring-edge'}`}
        >
          All
        </button>
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(group === g ? null : g)}
            className={`rounded-full px-3 py-1 text-xs ${group === g ? 'bg-accent text-ink' : 'bg-ink text-muted ring-1 ring-edge'}`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col">
        {results.map((e) => (
          <button
            key={`${e.group}-${e.name}`}
            onClick={() => pick(e.name, e.type)}
            className="flex items-center justify-between border-b border-edge py-3 text-left"
          >
            <span className="text-sm">{e.name}</span>
            <span className="text-xs text-muted">
              {added.includes(e.name) ? 'Added' : e.group}
            </span>
          </button>
        ))}
        {results.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nothing matches</p> : null}
      </div>
      {query.trim() && !exact ? (
        <div className="mt-4 rounded-xl bg-ink p-3 ring-1 ring-edge">
          <p className="text-sm">
            Create <span className="text-accent">{query.trim()}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SET_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => setNewType(t.type)}
                className={`rounded-full px-3 py-1 text-xs ${newType === t.type ? 'bg-accent text-ink' : 'bg-card text-muted ring-1 ring-edge'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              const exercise = { id: uid(), name: query.trim(), type: newType }
              onCreate(exercise)
              pick(exercise.name, exercise.type)
              setQuery('')
            }}
            className="mt-3 w-full rounded-lg bg-accent py-2 text-sm font-medium text-ink"
          >
            Save and add
          </button>
        </div>
      ) : null}

    </Sheet>
  )
}
