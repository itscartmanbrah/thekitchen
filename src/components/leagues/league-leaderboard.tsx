'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/player-avatar'
import { formatElo, getEloTier } from '@/lib/utils'
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { LeagueMemberWithProfile } from '@/types/database'

export function LeagueLeaderboard({ leagueId, currentUserId }: { leagueId: string; currentUserId: string }) {
  const [members, setMembers] = useState<LeagueMemberWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function fetchMembers() {
    const { data } = await supabase
      .from('league_members')
      .select('*, profiles(*)')
      .eq('league_id', leagueId)
      .order('elo_rating', { ascending: false })
    setMembers((data as LeagueMemberWithProfile[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMembers()
    const channel = supabase
      .channel(`leaderboard:${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` }, fetchMembers)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

  if (loading) return <div className="text-center py-12 text-gray-500">Loading leaderboard…</div>

  const rankIcon = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return null
  }

  return (
    <div className="space-y-2">
      {members.map((m, idx) => {
        const tier = getEloTier(m.elo_rating)
        const isMe = m.user_id === currentUserId
        const winRate = m.wins + m.losses > 0 ? Math.round((m.wins / (m.wins + m.losses)) * 100) : null

        return (
          <Card key={m.id} className={isMe ? 'border-green-300 bg-green-50/50' : ''}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="w-8 text-center">
                  {rankIcon(idx + 1) ?? (
                    <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                  )}
                </div>
                <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{m.profiles.display_name}</span>
                    {isMe && <Badge variant="outline" className="text-xs py-0">You</Badge>}
                  </div>
                  <span className={`text-xs ${tier.color}`}>{tier.label}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-base">{formatElo(m.elo_rating)}</div>
                  <div className="text-xs text-gray-500">
                    {m.wins}W {m.losses}L
                    {winRate !== null && <span className="ml-1">({winRate}%)</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
      {members.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          No players yet
        </div>
      )}
    </div>
  )
}
