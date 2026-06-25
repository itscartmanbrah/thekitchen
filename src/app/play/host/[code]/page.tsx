'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { setActiveHost } from '@/lib/active-host'
import { PlayHeader } from '@/components/play-header'
import { LeagueOpenPlay } from '@/components/leagues/league-open-play'

export default function SoloHostByCodePage({ params }: { params: { code: string } }) {
  const supabase = createClient()
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    async function adopt() {
      // make sure we have an identity (anonymous is fine), then claim the session
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) { if (alive) setState('error'); return }
      }
      const { error } = await supabase.rpc('adopt_solo_session', { p_manage_code: params.code })
      if (!alive) return
      if (error) { setState('error'); return }
      // remember it for Resume
      const { data: s } = await supabase.from('play_sessions')
        .select('name, share_code').eq('manage_code', params.code).single()
      if (s) setActiveHost({ manageCode: params.code, shareCode: (s as any).share_code, name: (s as any).name })
      setState('ok')
    }
    adopt()
    return () => { alive = false }
  }, [params.code])

  return (
    <div className="min-h-screen bg-gray-50">
      <PlayHeader right={<Link href="/play/new" className="text-sm text-gray-500 hover:text-green-600">New session</Link>} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        {state === 'loading' && <div className="text-center py-16 text-gray-400 text-sm">Opening your session…</div>}
        {state === 'error' && (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-4">We couldn&apos;t open that session — the link may be invalid or the session has ended.</p>
            <Link href="/play/new" className="text-green-600 font-medium hover:underline">Start a new session →</Link>
          </div>
        )}
        {state === 'ok' && <LeagueOpenPlay leagueId={null} isOrganizer solo />}
      </main>
    </div>
  )
}
