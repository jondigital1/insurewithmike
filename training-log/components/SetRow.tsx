'use client'

import { fmtTime, parseClock } from '@/lib/format'
import type { SetEntry, SetType } from '@/lib/types'

const FIELD =
  'w-full rounded-lg bg-ink px-2 py-2 text-center text-base num outline-none ring-1 ring-edge focus:ring-accent'

function NumberField({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  placeholder: string
  step?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step ?? '1'}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={FIELD}
    />
  )
}

function ClockField({
  value,
  onChange,
  placeholder,
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  placeholder: string
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      defaultValue={value != null ? fmtTime(value) : ''}
      placeholder={placeholder}
      onBlur={(e) => onChange(parseClock(e.target.value))}
      className={FIELD}
    />
  )
}

export default function SetRow({
  index,
  set,
  type,
  onChange,
  onRemove,
}: {
  index: number
  set: SetEntry
  type: SetType
  onChange: (patch: Partial<SetEntry>) => void
  onRemove: () => void
}) {
  const showRpe = type === 'W' || type === 'R'

  return (
    <div className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-xs text-muted num">{index + 1}</span>
      <div className="flex flex-1 items-center gap-2">
        {type === 'W' ? (
          <>
            <NumberField value={set.w} onChange={(w) => onChange({ w })} placeholder="lb" step="2.5" />
            <NumberField value={set.r} onChange={(r) => onChange({ r })} placeholder="reps" />
          </>
        ) : null}

        {type === 'R' ? <NumberField value={set.r} onChange={(r) => onChange({ r })} placeholder="reps" /> : null}

        {type === 'T' ? <ClockField value={set.t} onChange={(t) => onChange({ t })} placeholder="mm:ss" /> : null}

        {type === 'WD' ? (
          <>
            <NumberField value={set.w} onChange={(w) => onChange({ w })} placeholder="lb" step="2.5" />
            <NumberField value={set.d} onChange={(d) => onChange({ d })} placeholder="feet" />
          </>
        ) : null}

        {type === 'C' ? (
          <>
            <ClockField value={set.t} onChange={(t) => onChange({ t })} placeholder="mm:ss" />
            <NumberField value={set.d} onChange={(d) => onChange({ d })} placeholder="miles" step="0.1" />
          </>
        ) : null}

        {showRpe ? (
          <div className="w-16 shrink-0">
            <NumberField value={set.rpe} onChange={(rpe) => onChange({ rpe })} placeholder="RPE" step="0.5" />
          </div>
        ) : null}
      </div>
      <button
        onClick={onRemove}
        aria-label="Remove set"
        className="w-7 shrink-0 rounded-lg py-2 text-center text-sm text-muted"
      >
        &times;
      </button>
    </div>
  )
}
