'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/player-avatar'
import { CreateMatchDialog } from '@/components/matches/create-match-dialog'
import { SubmitScoreDialog } from '@/components/matches/submit-score-dialog'
import { formatElo } from '@/lib/utils'
import { Calendar, Swords } from 'lucide-react'
import type { LeagueMember } from '@/types/database'

interface Props {
  leagueId: string
  currentUserId: string
  isAdmin: boolean
  isOfficiator: boolean
  membership: LeagueMember
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

export function LeagueMatches({ leagueId, currentUserId, isAdmin, isOfficiator, membership }: Props) {
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function fetchMatches() {
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        match_players (
          *,
          profiles (*)
        )
      `)
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
    setMatches(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMatches()
    const channel = supabase
      .channel(`matches:${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `league_id=eq.${leagueId}` }, fetchMatches)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

  if (loading) return <div className="text-center py-12 text-gray-500">Loading matches…</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-gray-900">Match history</h2>
        {isAdmin && <CreateMatchDialog leagueId={leagueId} onCreated={fetchMatches} />}
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>No matches yet.</p>
          {isAdmin && <p className="text-sm mt-1">Create the first match to get things going.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map(match => {
            const team1 = match.match_players?.filter((p: any) => p.team === 1) ?? []
            const team2 = match.match_players?.filter((p: any) => p.team === 2) ?? []
            const canSubmitScore = match.status !== 'completed' && match.status !== 'cancelled' &&
              (isAdmin || match.officiator_id === currentUserId)

            return (
              <Card key={match.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Team 1 */}
                      <div className="flex items-center gap-1.5">
                        {team1.map((p: any) => (
                          <div key={p.id} className="flex items-center gap-1">
                            <PlayerAvatar name={p.profiles.display_name} color={p.profiles.avatar_color} size="sm" />
                            <span className="text-sm font-medium hidden sm:block">{p.profiles.display_name.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>

                      {/* Score */}
                      <div className="flex items-center gap-2 mx-2">
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
                            <PlayerAvatar name={p.profiles.display_name} color={p.profiles.avatar_color} size="sm" />
                            <span className="text-sm font-medium hidden sm:block">{p.profiles.display_name.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right hidden sm:block">
                        <Badge variant={statusVariants[match.status]} className="text-xs mb-1">
                          {match.status}
                        </Badge>
                        <p className="text-xs text-gray-500">{formatLabels[match.format]}</p>
                      </div>

                      {canSubmitScore && (
                        <SubmitScoreDialog match={match} onSubmitted={fetchMatches} />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
