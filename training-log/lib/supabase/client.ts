'use client'

import { createBrowserClient } from '@supabase/ssr'

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        // keepalive lets a write that starts as the page is going away finish
        // anyway. Sets are a few hundred bytes, nowhere near the 64KB ceiling.
        fetch: (input, init) => fetch(input, { ...init, keepalive: true }),
      },
    },
  )
}
