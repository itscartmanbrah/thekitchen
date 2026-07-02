'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getActiveHost, clearActiveHost, type ActiveHost } from '@/lib/active-host'
import { Play, X } from 'lucide-react'

// Shows a "Resume your Open Play session" bar if this device has an active
// standalone session it was hosting. Verifies it's still live before showing.
export function ResumeSessionBanner() {
  const supabase = createClient()
  const [host, setHost] = useState<ActiveHost | null>(null)

  useEffect(() => {
    const h = getActiveHost()
    if (!h) return
    supabase.rpc('get_open_play_public', { p_share_code: h.shareCode }).then(({ data }) => {
      const s = (data as any)?.session
      if (s && s.status !== 'ended') setHost(h)
      else clearActiveHost()
    })
  }, [])

  if (!host) return null
  return (
    <div className="bg-zinc-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <span className="text-sm truncate">
          <span className="text-blue-400 font-semibold">Open Play running</span>
          <span className="text-zinc-300"> · {host.name}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link href={`/play/host/${host.manageCode}`}
            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-lg px-3 py-1.5">
            <Play className="w-3.5 h-3.5" />Resume
          </Link>
          <button onClick={() => { clearActiveHost(); setHost(null) }} className="text-zinc-400 hover:text-white p-1" title="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}
