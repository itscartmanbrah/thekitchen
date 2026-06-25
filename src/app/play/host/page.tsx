'use client'

import Link from 'next/link'
import { PlayHeader } from '@/components/play-header'
import { LeagueOpenPlay } from '@/components/leagues/league-open-play'

export default function SoloHostPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PlayHeader right={<Link href="/play/new" className="text-sm text-gray-500 hover:text-green-600">New session</Link>} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <LeagueOpenPlay leagueId={null} isOrganizer solo />
      </main>
    </div>
  )
}
