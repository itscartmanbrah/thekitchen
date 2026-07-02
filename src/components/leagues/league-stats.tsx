'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/player-avatar'
import { BarChart3, Trophy, Zap, TrendingUp, Target, Swords } from 'lucide-react'

interface Stats {
  totalMatches: number
  avgScore: string
  mostActive: { name: string; color: string; avatarUrl: string | null; userId: string; count: number } | null
  topWinRate: { name: string; color: string; avatarUrl: string | null; userId: string; rate: number; wins: number; losses: number } | null
  biggestUpset: { winner: string; winnerColor: string; winnerAvatarUrl: string | null; winnerId: string; winnerElo: number; loserElo: number; diff: number } | null
  longestStreak: { name: string; color: string; avatarUrl: string | null; userId: string; streak: number } | null
}

function StatCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

export function LeagueStats({ leagueId }: { leagueId: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function compute() {
      const [{ data: matches }, { data: members }] = await Promise.all([
        supabase
          .from('matches')
          .select('id, team1_score, team2_score, format, completed_at, match_players(user_id, team, elo_before, elo_after, profiles(display_name, avatar_color, avatar_url))')
          .eq('league_id', leagueId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
        supabase
          .from('league_members')
          .select('user_id, wins, losses, profiles(display_name, avatar_color, avatar_url)')
          .eq('league_id', leagueId),
      ])

      if (!matches || !members) { setLoading(false); return }

      // Total matches & avg score
      const totalMatches = matches.length
      const avgScore = totalMatches > 0
        ? ((matches.reduce((s, m: any) => s + Math.max(m.team1_score, m.team2_score), 0) / totalMatches).toFixed(1) +
           '–' +
           (matches.reduce((s, m: any) => s + Math.min(m.team1_score, m.team2_score), 0) / totalMatches).toFixed(1))
        : '–'

      // Most active player (appeared in most matches)
      const playCount: Record<string, { count: number; name: string; color: string; avatarUrl: string | null }> = {}
      for (const m of matches) {
        for (const p of (m as any).match_players ?? []) {
          if (!playCount[p.user_id]) playCount[p.user_id] = { count: 0, name: p.profiles.display_name, color: p.profiles.avatar_color, avatarUrl: p.profiles.avatar_url ?? null }
          playCount[p.user_id].count++
        }
      }
      const mostActiveEntry = Object.entries(playCount).sort((a, b) => b[1].count - a[1].count)[0]
      const mostActive = mostActiveEntry
        ? { name: mostActiveEntry[1].name, color: mostActiveEntry[1].color, avatarUrl: mostActiveEntry[1].avatarUrl, userId: mostActiveEntry[0], count: mostActiveEntry[1].count }
        : null

      // Top win rate (min 3 matches)
      const topWinRateMember = (members as any[])
        .filter(m => m.wins + m.losses >= 3)
        .sort((a, b) => (b.wins / (b.wins + b.losses)) - (a.wins / (a.wins + a.losses)))[0]
      const topWinRate = topWinRateMember
        ? {
            name: topWinRateMember.profiles.display_name,
            color: topWinRateMember.profiles.avatar_color,
            avatarUrl: topWinRateMember.profiles.avatar_url ?? null,
            userId: topWinRateMember.user_id,
            rate: Math.round((topWinRateMember.wins / (topWinRateMember.wins + topWinRateMember.losses)) * 100),
            wins: topWinRateMember.wins,
            losses: topWinRateMember.losses,
          }
        : null

      // Biggest upset (winner had lower elo_before than loser)
      let biggestUpset: Stats['biggestUpset'] = null
      for (const m of matches) {
        const players = (m as any).match_players ?? []
        const t1 = players.filter((p: any) => p.team === 1)
        const t2 = players.filter((p: any) => p.team === 2)
        if (!t1.length || !t2.length) continue
        const t1AvgElo = t1.reduce((s: number, p: any) => s + p.elo_before, 0) / t1.length
        const t2AvgElo = t2.reduce((s: number, p: any) => s + p.elo_before, 0) / t2.length
        const t1Won = (m as any).team1_score > (m as any).team2_score
        const winnerAvg = t1Won ? t1AvgElo : t2AvgElo
        const loserAvg  = t1Won ? t2AvgElo : t1AvgElo
        const diff = loserAvg - winnerAvg
        if (diff > 0 && (!biggestUpset || diff > biggestUpset.diff)) {
          const winnerPlayers = t1Won ? t1 : t2
          biggestUpset = {
            winner: winnerPlayers[0].profiles.display_name,
            winnerColor: winnerPlayers[0].profiles.avatar_color,
            winnerAvatarUrl: winnerPlayers[0].profiles.avatar_url ?? null,
            winnerId: winnerPlayers[0].user_id,
            winnerElo: Math.round(winnerAvg),
            loserElo: Math.round(loserAvg),
            diff: Math.round(diff),
          }
        }
      }

      // Longest current win streak
      const streaks: Record<string, { streak: number; name: string; color: string; avatarUrl: string | null }> = {}
      // Iterate matches oldest-first to build streaks
      const chronological = [...matches].reverse()
      for (const m of chronological) {
        for (const p of (m as any).match_players ?? []) {
          if (!streaks[p.user_id]) streaks[p.user_id] = { streak: 0, name: p.profiles.display_name, color: p.profiles.avatar_color, avatarUrl: p.profiles.avatar_url ?? null }
          const won = p.team === 1
            ? (m as any).team1_score > (m as any).team2_score
            : (m as any).team2_score > (m as any).team1_score
          if (won) streaks[p.user_id].streak++
          else streaks[p.user_id].streak = 0
        }
      }
      const topStreak = Object.entries(streaks).sort((a, b) => b[1].streak - a[1].streak)[0]
      const longestStreak = topStreak && topStreak[1].streak >= 2
        ? { name: topStreak[1].name, color: topStreak[1].color, avatarUrl: topStreak[1].avatarUrl, userId: topStreak[0], streak: topStreak[1].streak }
        : null

      setStats({ totalMatches, avgScore, mostActive, topWinRate, biggestUpset, longestStreak })
      setLoading(false)
    }
    compute()
  }, [leagueId])

  if (loading) return <div className="text-center py-12 text-muted-foreground">Crunching numbers…</div>
  if (!stats || stats.totalMatches === 0) return (
    <div className="text-center py-16 text-muted-foreground/80">
      <BarChart3 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
      <p>Stats will appear once matches are completed.</p>
    </div>
  )

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <StatCard icon={<Swords className="w-4 h-4 text-muted-foreground" />} label="Total matches">
        <p className="text-2xl font-bold text-foreground">{stats.totalMatches}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Average score: {stats.avgScore}</p>
      </StatCard>

      {stats.mostActive && (
        <StatCard icon={<Zap className="w-4 h-4 text-yellow-500" />} label="Most active">
          <div className="flex items-center gap-2">
            <Link href={`/players/${stats.mostActive.userId}`}>
              <PlayerAvatar name={stats.mostActive.name} color={stats.mostActive.color} imageUrl={stats.mostActive.avatarUrl} size="sm" />
            </Link>
            <div>
              <Link href={`/players/${stats.mostActive.userId}`} className="font-semibold text-sm hover:underline">
                {stats.mostActive.name}
              </Link>
              <p className="text-xs text-muted-foreground">{stats.mostActive.count} matches played</p>
            </div>
          </div>
        </StatCard>
      )}

      {stats.topWinRate && (
        <StatCard icon={<Trophy className="w-4 h-4 text-green-500" />} label="Best win rate">
          <div className="flex items-center gap-2">
            <Link href={`/players/${stats.topWinRate.userId}`}>
              <PlayerAvatar name={stats.topWinRate.name} color={stats.topWinRate.color} imageUrl={stats.topWinRate.avatarUrl} size="sm" />
            </Link>
            <div>
              <Link href={`/players/${stats.topWinRate.userId}`} className="font-semibold text-sm hover:underline">
                {stats.topWinRate.name}
              </Link>
              <p className="text-xs text-muted-foreground">{stats.topWinRate.rate}% ({stats.topWinRate.wins}W–{stats.topWinRate.losses}L)</p>
            </div>
          </div>
        </StatCard>
      )}

      {stats.longestStreak && (
        <StatCard icon={<TrendingUp className="w-4 h-4 text-purple-500" />} label="Current win streak">
          <div className="flex items-center gap-2">
            <Link href={`/players/${stats.longestStreak.userId}`}>
              <PlayerAvatar name={stats.longestStreak.name} color={stats.longestStreak.color} imageUrl={stats.longestStreak.avatarUrl} size="sm" />
            </Link>
            <div>
              <Link href={`/players/${stats.longestStreak.userId}`} className="font-semibold text-sm hover:underline">
                {stats.longestStreak.name}
              </Link>
              <p className="text-xs text-muted-foreground">{stats.longestStreak.streak} in a row 🔥</p>
            </div>
          </div>
        </StatCard>
      )}

      {stats.biggestUpset && (
        <StatCard icon={<Target className="w-4 h-4 text-red-400" />} label="Biggest upset">
          <div className="flex items-center gap-2">
            <Link href={`/players/${stats.biggestUpset.winnerId}`}>
              <PlayerAvatar name={stats.biggestUpset.winner} color={stats.biggestUpset.winnerColor} imageUrl={stats.biggestUpset.winnerAvatarUrl} size="sm" />
            </Link>
            <div>
              <Link href={`/players/${stats.biggestUpset.winnerId}`} className="font-semibold text-sm hover:underline">
                {stats.biggestUpset.winner}
              </Link>
              <p className="text-xs text-muted-foreground">
                Won at {stats.biggestUpset.winnerElo} ELO vs {stats.biggestUpset.loserElo} (+{stats.biggestUpset.diff} underdog)
              </p>
            </div>
          </div>
        </StatCard>
      )}
    </div>
  )
}
