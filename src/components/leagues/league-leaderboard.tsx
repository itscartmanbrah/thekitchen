'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/player-avatar'
import { CountUp } from '@/components/ui/count-up'
import { formatElo, getEloTier, getPickleballRating } from '@/lib/utils'
import { Trophy } from 'lucide-react'
import type { LeagueMemberWithProfile, MatchFormat } from '@/types/database'


function SeasonSelector({ allSeasons, selected, onChange, activeSeason }: {
  allSeasons: { id: string; name: string; status: string }[]
  selected: string
  onChange: (id: string) => void
  activeSeason?: { id: string; name: string } | null
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs text-gray-500 shrink-0">Season:</span>
      <select
        value={selected}
        onChange={e => onChange(e.target.value)}
        className="text-xs border rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
      >
        <option value="current">{activeSeason ? `${activeSeason.name} (current)` : 'Current'}</option>
        {allSeasons.filter(s => s.status === 'ended').map(s => (
          <option key={s.id} value={s.id}>{s.name} · Final</option>
        ))}
      </select>
    </div>
  )
}

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

interface Season { id: string; name: string; status: string }

interface SeasonResult {
  user_id: string
  final_elo: number
  final_rank: number
  wins: number
  losses: number
  profiles: { display_name: string; avatar_color: string; avatar_url: string | null }
}

export function LeagueLeaderboard({ leagueId, currentUserId, activeSeason }: {
  leagueId: string
  currentUserId: string
  activeSeason?: Season | null
}) {
  const [members, setMembers] = useState<LeagueMemberWithProfile[]>([])
  const [formMap, setFormMap] = useState<Record<string, ('W' | 'L')[]>>({})
  const [loading, setLoading] = useState(true)
  const [formatFilter, setFormatFilter] = useState<MatchFormat | 'all'>('all')
  const [usedFormats, setUsedFormats] = useState<MatchFormat[]>([])

  // Season selector
  const [allSeasons, setAllSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('current')
  const [seasonResults, setSeasonResults] = useState<SeasonResult[] | null>(null)
  const [seasonLoading, setSeasonLoading] = useState(false)

  const supabase = createClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchMembers() {
    const { data } = await supabase
      .from('league_members')
      .select('*, profiles(*)')
      .eq('league_id', leagueId)
      .eq('status', 'active')
      .order('elo_rating', { ascending: false })
    setMembers((data as LeagueMemberWithProfile[]) ?? [])
    setLoading(false)
  }

  async function fetchForm() {
    // Fetch only the fields needed to compute form dots — smaller payload
    const { data: matches } = await supabase
      .from('matches')
      .select('id, team1_score, team2_score, format, match_players(user_id, team)')
      .eq('league_id', leagueId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(50)

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

  function scheduleRefresh() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchMembers()
      fetchForm()
    }, 800)
  }

  // Fetch all seasons for selector
  useEffect(() => {
    supabase
      .from('seasons')
      .select('id, name, status')
      .eq('league_id', leagueId)
      .order('started_at', { ascending: false })
      .then(({ data }) => setAllSeasons((data as Season[]) ?? []))
  }, [leagueId])

  // Fetch snapshot when a past season is selected
  useEffect(() => {
    if (selectedSeasonId === 'current') { setSeasonResults(null); return }
    setSeasonLoading(true)
    supabase
      .from('season_results')
      .select('user_id, final_elo, final_rank, wins, losses, profiles(display_name, avatar_color, avatar_url)')
      .eq('season_id', selectedSeasonId)
      .order('final_rank', { ascending: true })
      .then(({ data }) => {
        setSeasonResults((data as unknown as SeasonResult[]) ?? [])
        setSeasonLoading(false)
      })
  }, [selectedSeasonId, leagueId])

  useEffect(() => {
    fetchMembers()
    fetchForm()
    const channel = supabase
      .channel(`leaderboard:${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` }, scheduleRefresh)
      .subscribe()
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
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

  // When a format tab is active, rank and display by that format's rating
  const ratingFor = (m: LeagueMemberWithProfile): number => {
    if (formatFilter === 'doubles' || formatFilter === 'mixed_doubles') {
      return (m as any).doubles_elo ?? m.elo_rating
    }
    if (formatFilter === 'singles' || formatFilter === 'round_robin') {
      return (m as any).singles_elo ?? m.elo_rating
    }
    return m.elo_rating
  }

  const displayed = (formatMemberIds
    ? members.filter(m => formatMemberIds.has(m.user_id))
    : members
  ).slice().sort((a, b) => ratingFor(b) - ratingFor(a))

  // ── Past season view ──────────────────────────────────────────────────────
  if (selectedSeasonId !== 'current') {
    const season = allSeasons.find(s => s.id === selectedSeasonId)
    return (
      <div>
        {/* Season selector */}
        <SeasonSelector allSeasons={allSeasons} selected={selectedSeasonId} onChange={setSelectedSeasonId} activeSeason={activeSeason} />
        {seasonLoading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Final standings — {season?.name}</p>
            {(seasonResults ?? []).map((r, idx) => {
              const isMe = r.user_id === currentUserId
              const winRate = r.wins + r.losses > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) : null
              return (
                <Card key={r.user_id} className={isMe ? 'border-green-300 bg-green-50/50' : ''}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 text-center shrink-0">
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>}
                      </div>
                      <Link href={`/players/${r.user_id}`} className="shrink-0">
                        <PlayerAvatar name={r.profiles.display_name} color={r.profiles.avatar_color} imageUrl={r.profiles.avatar_url} size="sm" />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={`/players/${r.user_id}`} className="font-medium text-sm hover:underline">
                          {r.profiles.display_name}
                        </Link>
                        {isMe && <Badge variant="outline" className="text-xs py-0 ml-2">You</Badge>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-base">{formatElo(r.final_elo)}</div>
                        <div className="text-xs text-gray-500">
                          {r.wins}W {r.losses}L
                          {winRate !== null && <span className="ml-1">({winRate}%)</span>}
                        </div>
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

  return (
    <div>
      {/* Season selector */}
      {allSeasons.length > 0 && (
        <SeasonSelector allSeasons={allSeasons} selected={selectedSeasonId} onChange={setSelectedSeasonId} activeSeason={activeSeason} />
      )}

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

      {/* Summary cards */}
      {displayed.length > 0 && (() => {
        const myIdx = displayed.findIndex(m => m.user_id === currentUserId)
        const topPb = getPickleballRating(ratingFor(displayed[0]))
        return (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl bg-slate-900 px-4 py-3.5 shadow-md border-t-[3px] border-sky-500">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Players</p>
              <div className="text-2xl font-extrabold text-white mt-1"><CountUp value={displayed.length} /></div>
            </div>
            <div className="rounded-xl bg-slate-900 px-4 py-3.5 shadow-md border-t-[3px] border-violet-500">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Top rating</p>
              <div className="text-2xl font-extrabold text-white mt-1"><CountUp value={parseFloat(topPb.rating)} decimals={2} /></div>
            </div>
            <div className="rounded-xl bg-slate-900 px-4 py-3.5 shadow-md border-t-[3px] border-green-500">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Your rank</p>
              <div className="text-2xl font-extrabold text-white mt-1">
                {myIdx >= 0 ? <>#<CountUp value={myIdx + 1} /></> : <span className="text-lg text-slate-500">—</span>}
              </div>
            </div>
          </div>
        )
      })()}

      <div className="space-y-2">
        {displayed.map((m, idx) => {
          const shownElo = ratingFor(m)
          const tier = getEloTier(shownElo)
          const pb = getPickleballRating(shownElo)
          const isMe = m.user_id === currentUserId
          const winRate = m.wins + m.losses > 0 ? Math.round((m.wins / (m.wins + m.losses)) * 100) : null
          const form = formMap[m.user_id] ?? []

          return (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ layout: { duration: 0.4, type: 'spring', bounce: 0.2 }, duration: 0.3, delay: Math.min(idx * 0.03, 0.3) }}
              className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 ${isMe ? 'border-green-400 bg-green-50/60' : 'border-gray-200'}`}
            >
              <div className="w-7 text-center shrink-0">
                {rankIcon(idx + 1) ?? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 text-xs font-extrabold italic text-white">{idx + 1}</span>
                )}
              </div>
              <Link href={`/players/${m.user_id}`} className="shrink-0">
                <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} imageUrl={m.profiles.avatar_url} size="sm" />
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/players/${m.user_id}`} className="font-medium text-sm truncate hover:underline">
                    {m.profiles.display_name}
                  </Link>
                  {isMe && <Badge variant="outline" className="text-xs py-0">You</Badge>}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 bg-gray-100 ${tier.color}`}>{tier.label}</span>
                  <FormDots results={form} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-base text-gray-900"><CountUp value={shownElo} /></div>
                <div className="text-xs text-gray-500">
                  {m.wins}W {m.losses}L
                  {winRate !== null && <span className="ml-1">({winRate}%)</span>}
                </div>
              </div>
            </motion.div>
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
