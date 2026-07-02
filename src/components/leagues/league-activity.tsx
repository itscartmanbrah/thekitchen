'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/player-avatar'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface FeedItem {
  id: string
  matchId: string
  time: string
  format: string
  team1: { name: string; color: string; avatarUrl: string | null; userId: string; delta: number }[]
  team2: { name: string; color: string; avatarUrl: string | null; userId: string; delta: number }[]
  score1: number
  score2: number
}

const formatLabels: Record<string, string> = {
  singles: 'Singles', doubles: 'Doubles', mixed_doubles: 'Mixed Doubles', round_robin: 'Round Robin',
}

export function LeagueActivity({ leagueId }: { leagueId: string }) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function fetchActivity() {
    const { data } = await supabase
      .from('matches')
      .select('id, format, team1_score, team2_score, completed_at, match_players(user_id, team, elo_before, elo_after, profiles(display_name, avatar_color, avatar_url))')
      .eq('league_id', leagueId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20)

    const feed: FeedItem[] = (data ?? []).map((m: any) => ({
      id: m.id,
      matchId: m.id,
      time: m.completed_at,
      format: m.format,
      score1: m.team1_score,
      score2: m.team2_score,
      team1: m.match_players.filter((p: any) => p.team === 1).map((p: any) => ({
        name: p.profiles.display_name,
        color: p.profiles.avatar_color,
        avatarUrl: p.profiles.avatar_url ?? null,
        userId: p.user_id,
        delta: p.elo_after != null ? p.elo_after - p.elo_before : 0,
      })),
      team2: m.match_players.filter((p: any) => p.team === 2).map((p: any) => ({
        name: p.profiles.display_name,
        color: p.profiles.avatar_color,
        avatarUrl: p.profiles.avatar_url ?? null,
        userId: p.user_id,
        delta: p.elo_after != null ? p.elo_after - p.elo_before : 0,
      })),
    }))
    setItems(feed)
    setLoading(false)
  }

  useEffect(() => {
    fetchActivity()
    const ch = supabase.channel(`activity:${leagueId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `league_id=eq.${leagueId}` }, fetchActivity)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [leagueId])

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading activity…</div>

  if (items.length === 0) return (
    <div className="text-center py-16 text-muted-foreground/80">
      <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
      <p>No completed matches yet.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {items.map(item => {
        const team1Won = item.score1 > item.score2
        const timeAgo = formatTimeAgo(item.time)

        return (
          <Card key={item.id}>
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                {/* Avatars stack */}
                <div className="flex -space-x-1 shrink-0 mt-0.5">
                  {[...item.team1, ...item.team2].slice(0, 4).map((p, i) => (
                    <Link key={i} href={`/players/${p.userId}`}>
                      <PlayerAvatar name={p.name} color={p.color} imageUrl={p.avatarUrl} size="sm" />
                    </Link>
                  ))}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Main line */}
                  <p className="text-sm text-foreground">
                    <TeamNames players={item.team1} won={team1Won} />
                    <span className="text-muted-foreground font-bold mx-1">
                      {item.score1}–{item.score2}
                    </span>
                    <TeamNames players={item.team2} won={!team1Won} />
                  </p>

                  {/* ELO deltas */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {[...item.team1, ...item.team2].map((p, i) => (
                      <span key={i} className="text-xs text-muted-foreground flex items-center gap-0.5">
                        {p.name.split(' ')[0]}
                        {p.delta > 0
                          ? <span className="text-blue-400 font-medium ml-0.5 flex items-center"><TrendingUp className="w-2.5 h-2.5" />+{p.delta}</span>
                          : <span className="text-red-600 dark:text-red-400 font-medium ml-0.5 flex items-center"><TrendingDown className="w-2.5 h-2.5" />{p.delta}</span>
                        }
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground/80 mt-1">{formatLabels[item.format]} · {timeAgo}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function TeamNames({ players, won }: { players: { name: string; userId: string }[]; won: boolean }) {
  return (
    <>
      {players.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="text-muted-foreground/80"> & </span>}
          <Link href={`/players/${p.userId}`} className={`font-semibold hover:underline ${won ? 'text-blue-600 dark:text-blue-300' : 'text-foreground/90'}`}>
            {p.name.split(' ')[0]}
          </Link>
        </span>
      ))}
    </>
  )
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
