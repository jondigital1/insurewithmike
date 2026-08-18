'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fmtTime } from '@/lib/format'
import { REST_KEY, type RestState } from '@/lib/rest'

// One timer at a time, keyed to an end timestamp rather than a countdown, so a
// phone that locks mid rest comes back with the right number on it. Survives a
// reload too, which matters when the gym wifi drops and the page reloads.
export function useRest() {
  const [rest, setRest] = useState<RestState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const rang = useRef(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REST_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved) as RestState
      if (parsed.endsAt > Date.now()) setRest(parsed)
      else localStorage.removeItem(REST_KEY)
    } catch {
      // nothing worth doing if the value is unreadable
    }
  }, [])

  useEffect(() => {
    if (!rest) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [rest])

  const stop = useCallback(() => {
    setRest(null)
    rang.current = false
    try {
      localStorage.removeItem(REST_KEY)
    } catch {
      // ignore
    }
  }, [])

  const start = useCallback((exerciseId: string, name: string, seconds: number) => {
    if (seconds <= 0) return
    const next: RestState = { exerciseId, name, endsAt: Date.now() + seconds * 1000, total: seconds }
    rang.current = false
    setRest(next)
    setNow(Date.now())
    try {
      localStorage.setItem(REST_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }, [])

  const extend = useCallback((seconds: number) => {
    setRest((prev) => {
      if (!prev) return prev
      const next = { ...prev, endsAt: prev.endsAt + seconds * 1000, total: prev.total + seconds }
      rang.current = false
      try {
        localStorage.setItem(REST_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const remaining = rest ? Math.max(0, Math.round((rest.endsAt - now) / 1000)) : 0

  // Buzz and beep once, at zero. The tap that started the timer is the gesture
  // that lets audio play later, so this works without asking for anything.
  useEffect(() => {
    if (!rest || remaining > 0 || rang.current) return
    rang.current = true
    try {
      navigator.vibrate?.([120, 80, 120])
    } catch {
      // ignore
    }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 660
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.5)
      osc.onended = () => void ctx.close()
    } catch {
      // no audio, the number on screen still counts down
    }
  }, [rest, remaining])

  return { rest, remaining, start, stop, extend }
}

export default function RestBar({
  rest,
  remaining,
  onExtend,
  onStop,
}: {
  rest: RestState
  remaining: number
  onExtend: (seconds: number) => void
  onStop: () => void
}) {
  const done = remaining === 0
  const pct = Math.max(0, Math.min(100, (remaining / rest.total) * 100))

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg px-4 pb-6">
      <div
        className={`overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ${done ? 'ring-accent' : 'ring-edge'}`}
      >
        <div className="h-1 bg-ink">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">{done ? 'Rest is up' : 'Resting'}</p>
            <p className="truncate text-sm">{rest.name}</p>
          </div>
          <span className={`text-2xl num ${done ? 'text-accent' : ''}`}>{fmtTime(remaining)}</span>
          <button
            onClick={() => onExtend(30)}
            className="rounded-xl bg-ink px-3 py-2 text-xs text-muted ring-1 ring-edge"
          >
            +30s
          </button>
          <button onClick={onStop} className="rounded-xl bg-accent px-3 py-2 text-xs font-medium text-on-accent">
            {done ? 'Done' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  )
}
