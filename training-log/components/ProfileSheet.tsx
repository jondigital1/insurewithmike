'use client'

import { useState } from 'react'
import { COMMON_DISLIKES, OTHER_TRAINING, SORE_JOINTS, type Profile } from '@/lib/onboarding'
import { today } from '@/lib/format'
import { mondayOf, waveWeek } from '@/lib/wave'
import Sheet from './Sheet'

type Focus = 'minutes' | 'sore' | 'all'

const CHIP = 'rounded-full px-3 py-2 text-sm ring-1'
const ON = 'bg-accent text-on-accent ring-accent'
const OFF = 'bg-ink text-muted ring-edge'

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onToggle(o)}
          className={`${CHIP} ${selected.includes(o) ? ON : OFF}`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function Choice<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: { v: T; label: string }[]
  value: T | undefined
  onPick: (v: T) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o.v)} onClick={() => onPick(o.v)} className={`${CHIP} ${value === o.v ? ON : OFF}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 text-xs uppercase tracking-wide text-muted first:mt-0">{children}</h3>
}

export default function ProfileSheet({
  profile,
  focus,
  onSave,
  onClose,
}: {
  profile: Profile
  focus: Focus
  onSave: (next: Profile) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Profile>(profile)
  const set = (patch: Partial<Profile>) => setDraft((prev) => ({ ...prev, ...patch }))
  const toggle = (key: 'sore' | 'other' | 'dislikes', v: string) => {
    const list = draft[key] ?? []
    set({ [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] } as Partial<Profile>)
  }

  const title = focus === 'minutes' ? 'How long have you got?' : focus === 'sore' ? 'Anything sore?' : 'Your profile'

  return (
    <Sheet title={title} onClose={onClose}>
      {focus === 'minutes' || focus === 'all' ? (
        <>
          <Label>Time in the gym</Label>
          <Choice
            value={draft.minutes}
            onPick={(v) => set({ minutes: v })}
            options={[
              { v: 30 as const, label: '30 min' },
              { v: 45 as const, label: '45 min' },
              { v: 60 as const, label: '60 min' },
              { v: 75 as const, label: '75 or more' },
            ]}
          />
          <p className="mt-2 text-xs text-muted">Sets how many movements we put in a session.</p>
        </>
      ) : null}

      {focus === 'sore' || focus === 'all' ? (
        <>
          <Label>Anything giving you trouble</Label>
          <Chips options={SORE_JOINTS} selected={draft.sore ?? []} onToggle={(v) => toggle('sore', v)} />

          {(draft.sore ?? []).length ? (
            <>
              <div className="mt-4 rounded-2xl bg-ink p-3 ring-1 ring-edge">
                <p className="text-sm">
                  Working around it is normal. Keep it at{' '}
                  <span className="text-accent num">5 out of 10</span> or under while you lift, and it should be
                  back to its usual self the next morning. Worse the next day means that was too heavy.
                </p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Pain that wakes you at night, numbness or pins and needles down the limb, the joint giving way, a
                recent bad fall, weight loss you cannot explain?
              </p>
              <Choice
                value={draft.redFlag === undefined ? undefined : draft.redFlag ? 'yes' : 'no'}
                onPick={(v) => set({ redFlag: v === 'yes' })}
                options={[
                  { v: 'no' as const, label: 'None of those' },
                  { v: 'yes' as const, label: 'Yes, one of those' },
                ]}
              />
              {draft.redFlag ? (
                <p className="mt-3 border-l-2 border-accent pl-3 text-xs leading-relaxed text-muted">
                  Worth a professional eye before you load it. We will keep suggesting the rest.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {focus === 'all' ? (
        <>
          <Label>Barbell lifts</Label>
          <Choice
            value={draft.barbell}
            onPick={(v) => set({ barbell: v })}
            options={[
              { v: 'confident' as const, label: 'Confident' },
              { v: 'rusty' as const, label: 'A bit rusty' },
              { v: 'never' as const, label: 'Never tried' },
              { v: 'no' as const, label: 'Not interested' },
            ]}
          />

          <Label>Rest of the week</Label>
          <Chips options={OTHER_TRAINING} selected={draft.other ?? []} onToggle={(v) => toggle('other', v)} />
          {(draft.other ?? []).includes('Running') ? (
            <p className="mt-2 text-xs text-muted">Lift first when both land on the same day.</p>
          ) : null}

          <Label>Age</Label>
          <Choice
            value={draft.age}
            onPick={(v) => set({ age: v })}
            options={[
              { v: 'under40' as const, label: 'Under 40' },
              { v: '40to59' as const, label: '40 to 59' },
              { v: 'over60' as const, label: '60 or over' },
            ]}
          />

          <Label>Effort wave</Label>
          <Choice
            value={draft.wave ? 'on' : 'off'}
            onPick={(v) =>
              set(
                v === 'on'
                  ? { wave: true, waveStart: draft.waveStart ?? mondayOf(today()) }
                  : { wave: false },
              )
            }
            options={[
              { v: 'off' as const, label: 'Off' },
              { v: 'on' as const, label: 'Three week wave' },
            ]}
          />
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Build at two in reserve, push at one, then a week that goes to the end, on repeat. The coach
            line aims at the week you are in rather than the goal band.
            {draft.wave ? ` Currently week ${waveWeek(draft, today())?.index ?? 1} of 3.` : ''}
          </p>

          <Label>Never suggest</Label>
          <Chips
            options={COMMON_DISLIKES}
            selected={draft.dislikes ?? []}
            onToggle={(v) => toggle('dislikes', v)}
          />

          <Label>Days a week</Label>
          <Choice
            value={draft.days}
            onPick={(v) => set({ days: v })}
            options={[2, 3, 4, 5, 6].map((n) => ({ v: n, label: `${n}` }))}
          />
        </>
      ) : null}

      <button
        onClick={() => onSave(draft)}
        className="mt-6 w-full rounded-xl bg-accent py-3 text-sm font-medium text-on-accent"
      >
        Save
      </button>
    </Sheet>
  )
}
