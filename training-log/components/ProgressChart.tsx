'use client'

import { useState } from 'react'
import { fmtDate } from '@/lib/format'
import type { Series } from '@/lib/progress'

// One movement, one series, so the title carries the identity and no legend is
// needed. Different movements get their own chart rather than sharing an axis:
// a leg press and a lateral raise on one scale says nothing true.

const W = 340
const H = 150
const PAD = { top: 14, right: 12, bottom: 22, left: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

function short(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

export default function ProgressChart({ series }: { series: Series }) {
  const [active, setActive] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  const values = series.points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || Math.max(1, hi * 0.1)
  const yLo = lo - span * 0.25
  const yHi = hi + span * 0.25

  const first = new Date(series.points[0].date).getTime()
  const last = new Date(series.points[series.points.length - 1].date).getTime()
  const range = last - first || 1

  const x = (iso: string) => PAD.left + ((new Date(iso).getTime() - first) / range) * PLOT_W
  const y = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * PLOT_H

  const coords = series.points.map((p) => ({ ...p, cx: x(p.date), cy: y(p.value) }))
  const line = coords.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(' ')
  const area = `${line} L${coords[coords.length - 1].cx.toFixed(1)} ${PAD.top + PLOT_H} L${coords[0].cx.toFixed(1)} ${PAD.top + PLOT_H} Z`

  const ticks = [yLo + (yHi - yLo) * 0.15, (yLo + yHi) / 2, yHi - (yHi - yLo) * 0.15]
  const end = coords[coords.length - 1]
  const bestIndex = values.indexOf(series.best)
  const showBest = bestIndex !== coords.length - 1

  const point = active != null ? coords[active] : null

  function locate(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - box.left) / box.width) * W
    let nearest = 0
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].cx - px) < Math.abs(coords[nearest].cx - px)) nearest = i
    }
    setActive(nearest)
  }

  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-edge">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{series.name}</h3>
          <p className="text-xs text-muted">
            {series.metric} · {series.points.length} sessions
          </p>
        </div>
        <div className="shrink-0 text-right">
          {/* proportional figures on the hero number, tabular only where digits stack */}
          <p className="text-2xl leading-none">
            {Math.round(series.latest)}
            <span className="ml-1 text-sm text-muted">{series.unit}</span>
          </p>
          {series.change != null ? (
            <p className={`text-xs ${series.change >= 0 ? 'text-accent' : 'text-muted'}`}>
              {series.change >= 0 ? '+' : ''}
              {series.change}% since the first
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label={`${series.name}, ${series.metric} over ${series.points.length} sessions`}
          onPointerDown={locate}
          onPointerMove={(e) => {
            if (e.pressure > 0 || e.pointerType === 'mouse') locate(e)
          }}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-edge)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="num" fontSize="9" fill="var(--color-muted)">
                {Math.round(t)}
              </text>
            </g>
          ))}

          <path d={area} fill="var(--color-accent)" opacity="0.1" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {showBest ? (
            <circle
              cx={coords[bestIndex].cx}
              cy={coords[bestIndex].cy}
              r="4"
              fill="var(--color-card)"
              stroke="var(--color-accent)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {/* end marker, 8px with a 2px surface ring so it stays legible on the line */}
          <circle cx={end.cx} cy={end.cy} r="4" fill="var(--color-accent)" stroke="var(--color-card)" strokeWidth="2" />

          {point ? (
            <>
              <line
                x1={point.cx}
                x2={point.cx}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="var(--color-muted)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={point.cx} cy={point.cy} r="4.5" fill="var(--color-bright)" stroke="var(--color-card)" strokeWidth="2" />
            </>
          ) : null}

          <text x={PAD.left} y={H - 6} fontSize="9" className="num" fill="var(--color-muted)">
            {short(series.points[0].date)}
          </text>
          <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="9" className="num" fill="var(--color-muted)">
            {short(series.points[series.points.length - 1].date)}
          </text>
        </svg>

        {point ? (
          <div
            className="pointer-events-none absolute top-0 rounded-lg bg-ink px-2 py-1 text-xs ring-1 ring-edge"
            style={{
              left: `${Math.min(72, Math.max(0, (point.cx / W) * 100 - 14))}%`,
            }}
          >
            <span className="text-muted">{fmtDate(point.date)}</span>
            <span className="ml-2 num">{point.label}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-muted">
          Best {Math.round(series.best)} {series.unit}
          {showBest ? `, ${fmtDate(series.points[bestIndex].date)}` : ', latest session'}
        </p>
        <button onClick={() => setTable((t) => !t)} className="text-xs text-muted underline">
          {table ? 'Hide numbers' : 'Numbers'}
        </button>
      </div>

      {table ? (
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th className="pb-1 text-left font-normal">Date</th>
              <th className="pb-1 text-left font-normal">Top set</th>
              <th className="pb-1 text-right font-normal">{series.metric}</th>
            </tr>
          </thead>
          <tbody className="num">
            {[...series.points].reverse().map((p) => (
              <tr key={p.date} className="border-t border-edge">
                <td className="py-1">{fmtDate(p.date)}</td>
                <td className="py-1">{p.label}</td>
                <td className="py-1 text-right">
                  {Math.round(p.value)} {series.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  )
}
