'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function send() {
    if (!email.trim()) return
    setState('sending')
    const sb = supabaseBrowser()
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setState('error')
      setMessage(error.message)
      return
    }
    setState('sent')
  }

  return (
    <main className="flex min-h-screen flex-col justify-center px-6">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Training Log</h1>
        <p className="mt-2 text-sm text-muted">Log every set. See the last session. Know what to do next.</p>

        {state === 'sent' ? (
          <p className="mt-8 rounded-xl bg-card p-4 text-sm">
            Link sent to <span className="text-accent">{email}</span>. Open it on this device.
          </p>
        ) : (
          <div className="mt-8">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send()
              }}
              placeholder="you@example.com"
              className="w-full rounded-xl bg-card px-4 py-3 text-base outline-none ring-1 ring-edge focus:ring-accent"
            />
            <button
              onClick={() => void send()}
              disabled={state === 'sending'}
              className="mt-3 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-ink disabled:opacity-50"
            >
              {state === 'sending' ? 'Sending' : 'Send magic link'}
            </button>
            {state === 'error' ? <p className="mt-3 text-sm text-accent">{message}</p> : null}
          </div>
        )}
      </div>
    </main>
  )
}
