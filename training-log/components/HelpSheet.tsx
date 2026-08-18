'use client'

import { useMemo, useState } from 'react'
import { KNOWLEDGE, KNOWLEDGE_GROUPS, searchKnowledge, type KnowledgeEntry } from '@/lib/knowledge'
import Sheet from './Sheet'

function Entry({ entry, open, onToggle }: { entry: KnowledgeEntry; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-edge last:border-0">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 py-3 text-left">
        <span className="text-sm">{entry.q}</span>
        <span className="shrink-0 text-xs text-muted">{open ? 'less' : 'more'}</span>
      </button>
      {open ? <p className="pb-3 text-sm leading-relaxed text-muted">{entry.a}</p> : null}
    </div>
  )
}

export default function HelpSheet({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [group, setGroup] = useState<string>(KNOWLEDGE_GROUPS[0])

  const results = useMemo(() => (query.trim() ? searchKnowledge(query) : null), [query])
  const browse = useMemo(() => KNOWLEDGE.filter((e) => e.group === group), [group])

  return (
    <Sheet title="Help" onClose={onClose}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask about anything in the app"
        className="w-full rounded-xl bg-ink px-4 py-3 text-base outline-none ring-1 ring-edge focus:ring-accent"
      />

      {results ? (
        <div className="mt-3 flex flex-col">
          {results.map((entry) => (
            <Entry
              key={entry.id}
              entry={entry}
              open={open === entry.id}
              onToggle={() => setOpen(open === entry.id ? null : entry.id)}
            />
          ))}
          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Not covered yet. Help only knows what is built into the app, it never searches the
              internet. Browse the topics below for what it does know.
            </p>
          ) : null}
        </div>
      ) : null}

      {!results || results.length === 0 ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {KNOWLEDGE_GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  group === g ? 'bg-accent text-on-accent' : 'bg-ink text-muted ring-1 ring-edge'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-col">
            {browse.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                open={open === entry.id}
                onToggle={() => setOpen(open === entry.id ? null : entry.id)}
              />
            ))}
          </div>
        </>
      ) : null}

      <p className="mt-5 border-t border-edge pt-3 text-xs text-muted">
        Every answer here is written into the app. Nothing searches the internet, and a question
        this page cannot answer says so.
      </p>
    </Sheet>
  )
}
