'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PlayHeader, PlayBack } from '@/components/play-header'
import { LeagueOpenPlay } from '@/components/leagues/league-open-play'
import { OpenPlayMyHistory } from '@/components/open-play-my-history'

export default function SoloHostPage() {
  const [tab, setTab] = useState<'hosting' | 'history'>('hosting')
  return (
    <div className="min-h-screen bg-gray-50">
      <PlayHeader right={<Link href="/play/new" className="text-sm text-gray-500 hover:text-green-600">New session</Link>} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <PlayBack />

        <div className="flex items-center gap-1 mb-5 p-1 bg-slate-100 rounded-xl w-fit">
          {([['hosting', 'Hosting'], ['history', 'My games']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${tab === k ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'hosting' ? (
          <LeagueOpenPlay leagueId={null} isOrganizer solo />
        ) : (
          <>
            <h2 className="font-semibold text-gray-900 mb-1">Your Open Play history</h2>
            <p className="text-sm text-gray-500 mb-4">Every session you&apos;ve played in — league or standalone.</p>
            <OpenPlayMyHistory />
          </>
        )}
      </main>
    </div>
  )
}
