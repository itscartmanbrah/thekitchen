'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/player-avatar'
import { formatElo, getEloTier, getPickleballRating } from '@/lib/utils'
import { Trophy } from 'lucide-react'
import type { LeagueMemberWithProfile, MatchFormat } from '@/types/database'


const formatLabels: Record<string, string> = {
  all: 'All', singles: 'Singles', doubles: 'Doubles', mixed_doubles: 'Mixed', round_robin: 'Round Robin',
}

function FormDots({ results }: { results: ('W' | 'L')[] }) {
  if (results.length === 0) return null
  return (
    <div className="flex items-center gap-0.5 ml-1">
      {results.map((r, i) => (
        <span
          key={i}
          title={r === 'W' ? 'Win' : 'Loss'}
          className={`w-2 h-2 rounded-full ${r === 'W' ? 'bg-green-500' : 'bg-red-400'}`}
        />
      ))}
    </div>
  )
}

export function LeagueLeaderboard({ leagueId, currentUserId }: { leagueId: string; currentUserId: string }) {
  const [members, setMembers] = useState<LeagueMemberWithProfile[]>([])
  const [formMap, setFormMap] = useState<Record<string, ('W' | 'L')[]>>({})
  const [loading, setLoading] = useState(true)
  const [formatFilter, setFormatFilter] = useState<MatchFormat | 'all'>('all')
  const [usedFormats, setUsedFormats] = useState<MatchFormat[]>([])
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

  async function fetchForm() {
    // Get last 5 completed matches per player in this league
    const { data: matches } = await supabase
      .from('matches')
      .select('id, team1_score, team2_score, format, match_players(user_id, team)')
      .eq('league_id', leagueId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(100)

    if (!matches) return

    const formats = Array.from(new Set(matches.map((m: any) => m.format))) as MatchFormat[]
    setUsedFormats(formats)

    const map: Record<string, ('W' | 'L')[]> = {}
    for (const match of matches) {
      for (const player of (match as any).match_players ?? []) {
        if (!map[player.user_id]) map[player.user_id] = []
        if (map[player.user_id].length >= 5) continue

        const playerTeam = player.team
        const won = playerTeam === 1
          ? (match as any).team1_score > (match as any).team2_score
          : (match as any).team2_score > (match as any).team1_score
        map[player.user_id].push(won ? 'W' : 'L')
      }
    }
    setFormMap(map)
  }

  useEffect(() => {
    fetchMembers()
    fetchForm()
    const channel = supabase
      .channel(`leaderboard:${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` }, () => {
        fetchMembers()
        fetchForm()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

  // Per-format leaderboard: filter members by who played in that format
  const [formatMemberIds, setFormatMemberIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (formatFilter === 'all') { setFormatMemberIds(null); return }
    supabase
      .from('match_players')
      .select('user_id, matches!inner(league_id, format, status)')
      .eq('matches.league_id', leagueId)
      .eq('matches.format', formatFilter)
      .eq('matches.status', 'completed')
      .then(({ data }) => {
        const ids = new Set((data ?? []).map((r: any) => r.user_id))
        setFormatMemberIds(ids)
      })
  }, [formatFilter, leagueId])

  if (loading) return <div className="text-center py-12 text-gray-500">Loading leaderboard…</div>

  const rankIcon = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return null
  }

  const displayed = formatMemberIds
    ? members.filter(m => formatMemberIds.has(m.user_id))
    : members

  return (
    <div>
      {/* Format tabs */}
      {usedFormats.length > 1 && (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4 w-fit">
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
      )}

      <div className="space-y-2">
        {displayed.map((m, idx) => {
          const tier = getEloTier(m.elo_rating)
          const pb = getPickleballRating(m.elo_rating)
          const isMe = m.user_id === currentUserId
          const winRate = m.wins + m.losses > 0 ? Math.round((m.wins / (m.wins + m.losses)) * 100) : null
          const form = formMap[m.user_id] ?? []

          return (
            <Card key={m.id} className={isMe ? 'border-green-300 bg-green-50/50' : ''}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 text-center shrink-0">
                    {rankIcon(idx + 1) ?? (
                      <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                    )}
                  </div>
                  <Link href={`/players/${m.user_id}`} className="shrink-0">
                    <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} size="sm" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/players/${m.user_id}`} className="font-medium text-sm truncate hover:underline">
                        {m.profiles.display_name}
                      </Link>
                      {isMe && <Badge variant="outline" className="text-xs py-0">You</Badge>}
                      <FormDots results={form} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${pb.color}`}>{pb.rating}</span>
                      <span className="text-gray-300 text-xs">·</span>
                      <span className={`text-xs ${tier.color}`}>{tier.label}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
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
        {displayed.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Trophy className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            {members.length === 0 ? 'No players yet' : 'No players for this format yet'}
          </div>
        )}
      </div>
    </div>
  )
}
