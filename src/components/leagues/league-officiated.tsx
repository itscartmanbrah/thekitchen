'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/player-avatar'
import { Shield, Swords } from 'lucide-react'

const FORMAT_LABELS: Record<string, string> = {
  singles: 'Singles', doubles: 'Doubles', mixed_doubles: 'Mixed Doubles', round_robin: 'Round Robin',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function LeagueOfficiated({ leagueId, currentUserId }: { leagueId: string; currentUserId: string }) {
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('matches')
      .select('*, match_players(*, profiles(id, display_name, avatar_color, avatar_url))')
      .eq('league_id', leagueId)
      .eq('officiator_id', currentUserId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setMatches(data ?? [])
        setLoading(false)
      })
  }, [leagueId, currentUserId])

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>

  if (matches.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground/80">
        <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm">You have not officiated any matches in this league yet.</p>
      </div>
    )
  }

  const completed = matches.filter(m => m.status === 'completed').length
  const pending   = matches.filter(m => m.status !== 'completed' && m.status !== 'cancelled').length

  return (
    <div>
      {/* Summary */}
      <div className="flex gap-4 mb-5">
        <div className="bg-muted/40 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-bold text-foreground">{matches.length}</p>
          <p className="text-xs text-muted-foreground">Total officiated</p>
        </div>
        <div className="bg-green-500/10 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-bold text-green-300">{completed}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        {pending > 0 && (
          <div className="bg-orange-50 rounded-xl px-4 py-3 text-center">
            <p className="text-xl font-bold text-orange-600">{pending}</p>
            <p className="text-xs text-muted-foreground">Awaiting score</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {matches.map(match => {
          const team1 = (match.match_players ?? []).filter((p: any) => p.team === 1)
          const team2 = (match.match_players ?? []).filter((p: any) => p.team === 2)
          const isCompleted = match.status === 'completed'

          return (
            <Card key={match.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {/* Teams */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Team 1 */}
                      <div className="flex items-center gap-1">
                        {team1.map((p: any) => (
                          <div key={p.user_id} className="flex items-center gap-1">
                            <PlayerAvatar
                              name={p.profiles.display_name}
                              color={p.profiles.avatar_color}
                              imageUrl={p.profiles.avatar_url}
                              size="xs"
                            />
                            <span className="text-sm font-medium text-foreground">{p.profiles.display_name}</span>
                          </div>
                        ))}
                      </div>

                      <Swords className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />

                      {/* Team 2 */}
                      <div className="flex items-center gap-1">
                        {team2.map((p: any) => (
                          <div key={p.user_id} className="flex items-center gap-1">
                            <PlayerAvatar
                              name={p.profiles.display_name}
                              color={p.profiles.avatar_color}
                              imageUrl={p.profiles.avatar_url}
                              size="xs"
                            />
                            <span className="text-sm font-medium text-foreground">{p.profiles.display_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground/80">{FORMAT_LABELS[match.format] ?? match.format}</span>
                      <span className="text-gray-200 text-xs">·</span>
                      <span className="text-xs text-muted-foreground/80">{timeAgo(match.created_at)}</span>
                    </div>
                  </div>

                  {/* Score / status */}
                  <div className="text-right shrink-0">
                    {isCompleted ? (
                      <div className="text-sm font-bold text-foreground">
                        {match.team1_score} – {match.team2_score}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs capitalize">{match.status.replace('_', ' ')}</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
