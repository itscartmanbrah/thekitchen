'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PlayHeader, PlayBack } from '@/components/play-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueOpenPlay } from '@/components/leagues/league-open-play'
import { OpenPlayMyHistory } from '@/components/open-play-my-history'

export default function SoloHostPage() {
  const [tab, setTab] = useState<'hosting' | 'history'>(() => {
    if (typeof window === 'undefined') return 'hosting'
    return new URLSearchParams(window.location.search).get('tab') === 'history' ? 'history' : 'hosting'
  })
  return (
    <div className="min-h-screen bg-muted/40">
      <PlayHeader right={<Link href="/play/new" className="text-sm text-muted-foreground hover:text-primary">New session</Link>} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <PlayBack />

        <Tabs value={tab} onValueChange={v => setTab(v as 'hosting' | 'history')} className="mb-5">
          <TabsList>
            <TabsTrigger value="hosting">Hosting</TabsTrigger>
            <TabsTrigger value="history">My games</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'hosting' ? (
          <LeagueOpenPlay leagueId={null} isOrganizer solo />
        ) : (
          <>
            <h2 className="font-semibold text-foreground mb-1">Your Open Play history</h2>
            <p className="text-sm text-muted-foreground mb-4">Every session you&apos;ve played in — league or standalone.</p>
            <OpenPlayMyHistory />
          </>
        )}
      </main>
    </div>
  )
}
