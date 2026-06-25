'use client'

import Link from 'next/link'
import { AppLogo } from '@/components/app-logo'
import { LeagueOpenPlay } from '@/components/leagues/league-open-play'

export default function SoloHostPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2"><AppLogo className="w-7 h-7" /><span className="font-bold text-gray-900">The Kitchen</span></Link>
          <Link href="/play/new" className="text-sm text-gray-500 hover:text-green-600">New session</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <LeagueOpenPlay leagueId={null} isOrganizer solo />
      </main>
    </div>
  )
}
