'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Sub = { table: string; filter?: string }

// Subscribe to Postgres change events on one or more tables and run `onChange`
// (debounced) whenever any of them change. The callback is held in a ref so it
// always sees the latest closure without forcing a re-subscribe — only `deps`
// (typically the league/session id) tear down and recreate the channel.
export function useRealtime(
  channelName: string,
  subs: Sub[],
  onChange: () => void,
  deps: unknown[],
) {
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => cb.current(), 350)
    }

    let channel = supabase.channel(channelName)
    for (const s of subs) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        fire,
      )
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
