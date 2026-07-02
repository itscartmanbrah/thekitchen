import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppLogo } from '@/components/app-logo'
import { TournamentBracket } from '@/components/tournaments/tournament-bracket'
import { PublicDivisions } from '@/components/tournaments/public-divisions'
import { Trophy } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function PublicTournamentPage({ params }: { params: { code: string } }) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_tournament_public', { p_share_code: params.code })

  const tournament = data?.tournament
  if (!tournament) notFound()

  const players = data.players ?? []
  const matches = data.matches ?? []
  const divisions = data.divisions ?? []
  const hasDivisions = divisions.length > 0
  const winner = tournament.winner_id
    ? players.find((p: any) => p.user_id === tournament.winner_id)
    : null

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <AppLogo className="w-7 h-7" />
            <span className="font-bold text-foreground">The Kitchen</span>
          </Link>
          <span className="text-xs text-muted-foreground/80">Live bracket</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-foreground">{tournament.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {tournament.league_name}
            <span className="mx-2 text-muted-foreground/50">·</span>
            <span className={tournament.status === 'completed' ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>
              {tournament.status === 'completed' ? 'Completed' : 'In progress'}
            </span>
          </p>
          {!hasDivisions && winner && (
            <div className="mt-3 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <span className="text-lg">🏆</span>
              <span className="text-sm font-semibold text-amber-800">{winner.display_name} wins!</span>
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border p-4">
          {hasDivisions ? (
            <PublicDivisions divisions={divisions} />
          ) : (
            <TournamentBracket players={players} matches={matches} />
          )}
        </div>

        <p className="text-xs text-muted-foreground/80 text-center mt-6">
          Powered by The Kitchen — pickleball league rankings.{' '}
          <Link href="/signup" className="text-green-600 hover:underline">Create your own league</Link>
        </p>
      </main>
    </div>
  )
}
