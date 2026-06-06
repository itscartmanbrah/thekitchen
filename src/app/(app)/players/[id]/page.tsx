import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/player-avatar'
import { EloHistoryChart } from '@/components/elo-history-chart'
import { formatElo, getEloTier, getPickleballRating } from '@/lib/utils'
import { Trophy, MapPin, TrendingUp } from 'lucide-react'

const roleLabels: Record<string, string> = {
  head_admin: 'Head Admin',
  admin: 'Admin',
  officiator: 'Officiator',
  player: 'Player',
}

export default async function PublicProfilePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const isOwn = user?.id === params.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!profile) {
    console.error(`[players/${params.id}] profile not found — user auth uid: ${user?.id}`)
    notFound()
  }

  // Memberships + league details
  const { data: memberships } = await supabase
    .from('league_members')
    .select('*, leagues(*)')
    .eq('user_id', params.id)
    .eq('status', 'active')
    .order('elo_rating', { ascending: false })

  // Rank position per league + per-league ELO history
  const rankedMemberships = await Promise.all(
    (memberships ?? []).map(async (m: any) => {
      try {
        const [{ count }, { count: total }, { data: txRows }] = await Promise.all([
          supabase
            .from('league_members')
            .select('*', { count: 'exact', head: true })
            .eq('league_id', m.league_id)
            .eq('status', 'active')
            .gt('elo_rating', m.elo_rating),
          supabase
            .from('league_members')
            .select('*', { count: 'exact', head: true })
            .eq('league_id', m.league_id)
            .eq('status', 'active'),
          supabase
            .from('point_transactions')
            .select('points_after, created_at')
            .eq('user_id', params.id)
            .eq('league_id', m.league_id)
            .order('created_at', { ascending: true })
            .limit(50),
        ])

        // Season results for this player in this league (wrapped separately in case table doesn't exist yet)
        let seasonRows = null
        try {
          const { data } = await supabase
            .from('season_results')
            .select('final_elo, final_rank, wins, losses, seasons(name, ended_at)')
            .eq('user_id', params.id)
            .eq('league_id', m.league_id)
            .order('created_at', { ascending: false })
          seasonRows = data
        } catch {
          seasonRows = null
        }

        const eloHistory = (txRows ?? []).map((t: any) => ({
          elo: t.points_after,
          date: new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          label: new Date(t.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
        }))

        return {
          ...m,
          rank: (count ?? 0) + 1,
          totalPlayers: total ?? 1,
          eloHistory,
          seasonHistory: seasonRows ?? [],
        }
      } catch {
        // If any query fails for this membership, return safe defaults
        return {
          ...m,
          rank: 1,
          totalPlayers: 1,
          eloHistory: [],
          seasonHistory: [],
        }
      }
    })
  )

  const totalWins   = rankedMemberships.reduce((s, m) => s + m.wins, 0)
  const totalLosses = rankedMemberships.reduce((s, m) => s + m.losses, 0)
  const bestElo     = rankedMemberships.length > 0 ? rankedMemberships[0].elo_rating : 1000
  const pb          = getPickleballRating(bestElo)
  const tier        = getEloTier(bestElo)
  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── Head-to-head vs the logged-in viewer ─────────────────────────────────
  let h2h: { myWins: number; theirWins: number; total: number } | null = null
  if (user && !isOwn) {
    try {
      // Find all matches where both players appear
      const { data: myMatches } = await supabase
        .from('match_players')
        .select('match_id, team')
        .eq('user_id', user.id)

      const myMatchIds = (myMatches ?? []).map((r: any) => r.match_id)

      if (myMatchIds.length > 0) {
        const { data: sharedRows } = await supabase
          .from('match_players')
          .select('match_id, team, matches(status, team1_score, team2_score)')
          .eq('user_id', params.id)
          .in('match_id', myMatchIds)

        let myWins = 0
        let theirWins = 0

        for (const row of (sharedRows ?? []) as any[]) {
          const match = row.matches
          if (match?.status !== 'completed') continue

          // Which team is the viewed player on?
          const theirTeam: number = row.team
          // Which team am I on?
          const meRow = (myMatches ?? []).find((r: any) => r.match_id === row.match_id)
          if (!meRow) continue
          const myTeam: number = meRow.team

          // Skip if same team (doubles partner — not a head-to-head)
          if (myTeam === theirTeam) continue

          const t1 = match.team1_score
          const t2 = match.team2_score
          const winningTeam = t1 > t2 ? 1 : 2

          if (winningTeam === myTeam) myWins++
          else theirWins++
        }

        const total = myWins + theirWins
        if (total > 0) h2h = { myWins, theirWins, total }
      }
    } catch {
      // h2h stays null — non-critical, just skip the section
    }
  }

  return (
    <div className="max-w-2xl">

      {/* ── Hero card ── */}
      <Card className="mb-6 overflow-hidden">
        <div className="h-2" style={{ backgroundColor: rankedMemberships[0]?.leagues?.banner_color ?? '#16a34a' }} />
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start gap-5">
            <PlayerAvatar name={profile.display_name} color={profile.avatar_color} imageUrl={(profile as any).avatar_url} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{profile.display_name}</h1>
                {isOwn && (
                  <Link href="/profile">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-gray-50">Edit profile</Badge>
                  </Link>
                )}
              </div>
              {profile.nickname && (profile.first_name || profile.last_name) && (
                <p className="text-sm text-gray-500 mt-0.5">{profile.first_name} {profile.last_name}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Member since {memberSince}</p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className={`text-sm font-bold ${pb.color}`}>{pb.rating}</span>
                <span className="text-gray-300">·</span>
                <span className={`text-sm font-medium ${tier.color}`}>{tier.label}</span>
              </div>
            </div>

            <div className="hidden sm:grid grid-cols-3 gap-3 text-center shrink-0">
              <div>
                <p className="text-lg font-bold text-gray-900">{rankedMemberships.length}</p>
                <p className="text-xs text-gray-500">Leagues</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600">{totalWins}</p>
                <p className="text-xs text-gray-500">Wins</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-500">{totalLosses}</p>
                <p className="text-xs text-gray-500">Losses</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center mt-4 sm:hidden">
            <div className="bg-gray-50 rounded-lg py-2">
              <p className="text-lg font-bold text-gray-900">{rankedMemberships.length}</p>
              <p className="text-xs text-gray-500">Leagues</p>
            </div>
            <div className="bg-green-50 rounded-lg py-2">
              <p className="text-lg font-bold text-green-600">{totalWins}</p>
              <p className="text-xs text-gray-500">Wins</p>
            </div>
            <div className="bg-gray-50 rounded-lg py-2">
              <p className="text-lg font-bold text-gray-500">{totalLosses}</p>
              <p className="text-xs text-gray-500">Losses</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Head-to-head ── */}
      {h2h && (
        <Card className="mb-6">
          <CardContent className="py-4 px-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Your head-to-head</p>
            <div className="flex items-center gap-3">
              {/* My side */}
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold text-green-600">{h2h.myWins}</p>
                <p className="text-xs text-gray-500 mt-0.5">You</p>
              </div>

              {/* Bar */}
              <div className="flex-[2] space-y-1.5">
                <div className="flex rounded-full overflow-hidden h-3 bg-gray-100">
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${Math.round((h2h.myWins / h2h.total) * 100)}%` }}
                  />
                  <div
                    className="bg-red-400 transition-all"
                    style={{ width: `${Math.round((h2h.theirWins / h2h.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-center text-gray-400">{h2h.total} match{h2h.total !== 1 ? 'es' : ''} played</p>
              </div>

              {/* Their side */}
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold text-red-400">{h2h.theirWins}</p>
                <p className="text-xs text-gray-500 mt-0.5">{profile.display_name.split(' ')[0]}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── League memberships + per-league chart ── */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Leagues · Rankings
      </h2>

      {rankedMemberships.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-400 text-sm">
            Not a member of any leagues yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rankedMemberships.map((m: any) => {
            const mPb   = getPickleballRating(m.elo_rating)
            const mTier = getEloTier(m.elo_rating)
            const mWR   = m.wins + m.losses > 0
              ? Math.round((m.wins / (m.wins + m.losses)) * 100)
              : null

            return (
              <Card key={m.id} className="overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: m.leagues?.banner_color ?? '#16a34a' }} />
                <CardContent className="py-4 px-4">

                  {/* Stats row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="font-semibold text-gray-900 text-sm">{m.leagues?.name}</p>
                        <Badge variant="outline" className="text-xs py-0">
                          {roleLabels[m.role] ?? m.role}
                        </Badge>
                      </div>
                      {m.leagues?.location && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                          <MapPin className="w-3 h-3" />
                          {m.leagues.location}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <div className="flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-0.5">
                          <Trophy className="w-3 h-3 text-gray-500" />
                          <span className="text-xs font-semibold text-gray-700">
                            #{m.rank} of {m.totalPlayers}
                          </span>
                        </div>
                        <span className={`text-xs font-semibold ${mPb.color}`}>{mPb.rating}</span>
                        <span className="text-gray-300 text-xs">·</span>
                        <span className={`text-xs ${mTier.color}`}>{mTier.label}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-gray-900">{formatElo(m.elo_rating)}</p>
                      <p className="text-xs text-gray-400">ELO</p>
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="text-green-600 font-medium">{m.wins}W</span>
                        {' – '}
                        <span className="text-gray-500">{m.losses}L</span>
                        {mWR !== null && <span className="ml-1 text-gray-400">({mWR}%)</span>}
                      </p>
                    </div>
                  </div>

                  {/* Season history */}
                  {m.seasonHistory.length > 0 && (
                    <div className="border-t pt-3 mt-2 space-y-1.5">
                      <p className="text-xs text-gray-400 font-medium mb-2">Season history</p>
                      {m.seasonHistory.map((sr: any, i: number) => {
                        const sWR = sr.wins + sr.losses > 0
                          ? Math.round((sr.wins / (sr.wins + sr.losses)) * 100)
                          : null
                        return (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {i === 0 && sr.final_rank === 1 && <span>🏆</span>}
                              {i === 0 && sr.final_rank === 2 && <span>🥈</span>}
                              <span className="text-gray-600 font-medium">{sr.seasons?.name ?? 'Season'}</span>
                              <span className="text-gray-400">· Final #{sr.final_rank}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-500">
                              <span className="font-semibold text-gray-700">{sr.final_elo} ELO</span>
                              <span>{sr.wins}W {sr.losses}L{sWR !== null ? ` (${sWR}%)` : ''}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Per-league ELO chart */}
                  {m.eloHistory.length >= 2 ? (
                    <div className="border-t pt-3">
                      <p className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                        <TrendingUp className="w-3 h-3" /> ELO progression
                      </p>
                      <EloHistoryChart data={m.eloHistory} />
                    </div>
                  ) : m.eloHistory.length === 1 ? (
                    <p className="text-xs text-gray-400 border-t pt-3">
                      Play one more match to see your ELO chart.
                    </p>
                  ) : null}

                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-center text-gray-400">
        <Link href="/elo" className="underline hover:text-gray-600">How are these ratings calculated?</Link>
      </p>
    </div>
  )
}
