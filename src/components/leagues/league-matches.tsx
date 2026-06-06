'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/player-avatar'
import { CreateMatchDialog } from '@/components/matches/create-match-dialog'
import { SubmitScoreDialog } from '@/components/matches/submit-score-dialog'
import { RematchButton } from '@/components/matches/rematch-button'
import { Calendar, Swords, StickyNote, TrendingUp, TrendingDown } from 'lucide-react'
import type { MatchFormat } from '@/types/database'

interface Props {
  leagueId: string
  currentUserId: string
  isAdmin: boolean
}

const formatLabels: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  mixed_doubles: 'Mixed Doubles',
  round_robin: 'Round Robin',
}

const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'success' | 'warning'> = {
  scheduled: 'warning',
  in_progress: 'default',
  completed: 'success',
  cancelled: 'outline',
}



function EloDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-gray-400">±0</span>
  if (delta > 0) return (
    <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
      <TrendingUp className="w-3 h-3" />+{delta}
    </span>
  )
  return (
    <span className="text-xs text-red-500 font-medium flex items-center gap-0.5">
      <TrendingDown className="w-3 h-3" />{delta}
    </span>
  )
}

export function LeagueMatches({ leagueId, currentUserId, isAdmin }: Props) {
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [formatFilter, setFormatFilter] = useState<MatchFormat | 'all'>('all')
  const [playerFilter, setPlayerFilter] = useState<string>('all')
  const [members, setMembers] = useState<any[]>([])
  const supabase = createClient()

  async function fetchMatches() {
    const { data } = await supabase
      .from('matches')
      .select('*, match_players(*, profiles(*))')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
    setMatches(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMatches()
    supabase.from('league_members').select('*, profiles(*)').eq('league_id', leagueId)
      .then(({ data }) => setMembers(data ?? []))

    const channel = supabase.channel(`matches:${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `league_id=eq.${leagueId}` }, fetchMatches)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

  const filtered = matches.filter(m => {
    if (formatFilter !== 'all' && m.format !== formatFilter) return false
    if (playerFilter !== 'all' && !m.match_players?.some((p: any) => p.user_id === playerFilter)) return false
    return true
  })

  // Formats that actually have matches
  const usedFormats = Array.from(new Set(matches.map(m => m.format))) as MatchFormat[]

  if (loading) return <div className="text-center py-12 text-gray-500">Loading matches…</div>

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-gray-900">Match history</h2>
        {isAdmin && <CreateMatchDialog leagueId={leagueId} onCreated={fetchMatches} />}
      </div>

      {/* Filters */}
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Format filter tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setFormatFilter('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${formatFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              All
            </button>
            {usedFormats.map(f => (
              <button
                key={f}
                onClick={() => setFormatFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${formatFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {formatLabels[f]}
              </button>
            ))}
          </div>

          {/* Player filter */}
          <select
            value={playerFilter}
            onChange={e => setPlayerFilter(e.target.value)}
            className="text-xs border rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="all">All players</option>
            {members.map((m: any) => (
              <option key={m.user_id} value={m.user_id}>{m.profiles.display_name}</option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>{matches.length === 0 ? 'No matches yet.' : 'No matches match your filters.'}</p>
          {isAdmin && matches.length === 0 && <p className="text-sm mt-1">Create the first match to get things going.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(match => {
            const team1 = match.match_players?.filter((p: any) => p.team === 1) ?? []
            const team2 = match.match_players?.filter((p: any) => p.team === 2) ?? []
            const myPlayer = match.match_players?.find((p: any) => p.user_id === currentUserId)
            const myDelta = myPlayer && myPlayer.elo_after != null
              ? myPlayer.elo_after - myPlayer.elo_before
              : null

            const canSubmitScore = match.status !== 'completed' && match.status !== 'cancelled' &&
              (isAdmin || match.officiator_id === currentUserId)

            const scheduledDate = match.scheduled_at
              ? new Date(match.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : null

            return (
              <Card key={match.id}>
                <CardContent className="py-3 px-4">
                  {/* Top row: teams + score */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Team 1 */}
                      <div className="flex items-center gap-1.5">
                        {team1.map((p: any) => (
                          <div key={p.id} className="flex items-center gap-1">
                            <Link href={`/players/${p.user_id}`}>
                              <PlayerAvatar name={p.profiles.display_name} color={p.profiles.avatar_color} imageUrl={p.profiles.avatar_url} size="sm" />
                            </Link>
                            <span className="text-sm font-medium hidden sm:block">{p.profiles.display_name.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>

                      {/* Score */}
                      <div className="flex items-center gap-2 mx-1">
                        {match.status === 'completed' ? (
                          <div className="flex items-center gap-1 font-bold text-lg">
                            <span className={match.team1_score > match.team2_score ? 'text-green-600' : 'text-gray-400'}>
                              {match.team1_score}
                            </span>
                            <span className="text-gray-300 font-normal">–</span>
                            <span className={match.team2_score > match.team1_score ? 'text-green-600' : 'text-gray-400'}>
                              {match.team2_score}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm font-medium">vs</span>
                        )}
                      </div>

                      {/* Team 2 */}
                      <div className="flex items-center gap-1.5">
                        {team2.map((p: any) => (
                          <div key={p.id} className="flex items-center gap-1">
                            <Link href={`/players/${p.user_id}`}>
                              <PlayerAvatar name={p.profiles.display_name} color={p.profiles.avatar_color} imageUrl={p.profiles.avatar_url} size="sm" />
                            </Link>
                            <span className="text-sm font-medium hidden sm:block">{p.profiles.display_name.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {myDelta !== null && <EloDelta delta={myDelta} />}
                      <div className="text-right hidden sm:block">
                        <Badge variant={statusVariants[match.status]} className="text-xs mb-0.5">
                          {match.status}
                        </Badge>
                        <p className="text-xs text-gray-500">{formatLabels[match.format]}</p>
                      </div>
                      {canSubmitScore && <SubmitScoreDialog match={match} onSubmitted={fetchMatches} />}
                      {match.status === 'completed' && isAdmin && (
                        <RematchButton match={match} onCreated={fetchMatches} />
                      )}
                    </div>
                  </div>

                  {/* Bottom row: scheduled time + notes */}
                  {(scheduledDate || match.notes) && (
                    <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-gray-100">
                      {scheduledDate && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {scheduledDate}
                        </div>
                      )}
                      {match.notes && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <StickyNote className="w-3 h-3" />
                          {match.notes}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
