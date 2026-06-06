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

  if (!profile) notFound()

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
      }
    })
  )

  const totalWins   = rankedMemberships.reduce((s, m) => s + m.wins, 0)
  const totalLosses = rankedMemberships.reduce((s, m) => s + m.losses, 0)
  const bestElo     = rankedMemberships.length > 0 ? rankedMemberships[0].elo_rating : 1000
  const pb          = getPickleballRating(bestElo)
  const tier        = getEloTier(bestElo)
  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="max-w-2xl">

      {/* ── Hero card ── */}
      <Card className="mb-6 overflow-hidden">
        <div className="h-2" style={{ backgroundColor: rankedMemberships[0]?.leagues?.banner_color ?? '#16a34a' }} />
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start gap-5">
            <PlayerAvatar name={profile.display_name} color={profile.avatar_color} size="lg" />
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
