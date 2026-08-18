'use client'

import { useEffect } from 'react'

export default function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl bg-card px-4 pb-8 pt-3 ring-1 ring-edge"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 -mx-4 mb-3 flex items-center justify-between bg-card px-4 pb-3 pt-1">
          <div className="absolute inset-x-0 -top-1 mx-auto h-1 w-10 rounded-full bg-edge" />
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-muted">
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
