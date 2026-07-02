'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PlayerAvatar } from '@/components/player-avatar'
import { ArrowLeft, ChevronDown, Trophy, Swords } from 'lucide-react'

interface Ended {
  id: string; name: string; match_mode: string; format: string; rated: boolean
  court_count: number; started_at: string | null; ended_at: string | null; ends_at: string | null
}
interface SP { id: string; display_name: string; avatar_color: string; avatar_url?: string | null; user_id: string | null; wins: number; losses: number; games: number }
interface DoneGame { team1_ids: string[]; team2_ids: string[]; team1_score: number | null; team2_score: number | null; winner_team: number | null; court_number: number | null }
interface Detail { players: SP[]; games: DoneGame[]; points: Map<string, number> }

const modeLabel: Record<string, string> = {
  balanced: 'Drop-in', skill: 'Drop-in', mixed: 'Drop-in', ladder: 'King of the Court',
  king: 'King of the Court', americano: 'Americano', mexicano: 'Mexicano',
}

export function LeagueOpenPlayHistory({ leagueId, createdBy, onBack }: { leagueId: string | null; createdBy?: string | null; onBack: () => void }) {
  const supabase = createClient()
  const [sessions, setSessions] = useState<Ended[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const nowIso = new Date().toISOString()
    let q = supabase.from('play_sessions')
      .select('id, name, match_mode, format, rated, court_count, started_at, ended_at, ends_at')
      .or(`ended_at.not.is.null,ends_at.lt.${nowIso}`)
    q = createdBy ? q.is('league_id', null).eq('created_by', createdBy) : q.eq('league_id', leagueId as string)
    q.order('started_at', { ascending: false })
      .then(({ data }) => { setSessions((data as Ended[]) ?? []); setLoading(false) })
  }, [leagueId, createdBy])

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id); setDetail(null); setDetailLoading(true)
    const [{ data: sp }, { data: g }] = await Promise.all([
      supabase.from('session_players').select('id, display_name, avatar_color, user_id, wins, losses, games').eq('session_id', id),
      supabase.from('session_games').select('team1_ids, team2_ids, team1_score, team2_score, winner_team, court_number').eq('session_id', id).eq('status', 'completed').order('completed_at'),
    ])
    const players = (sp as SP[]) ?? []
    const memberIds = players.filter(p => p.user_id).map(p => p.user_id as string)
    if (memberIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, avatar_url').in('id', memberIds)
      const map = new Map(((profs ?? []) as any[]).map(p => [p.id, p.avatar_url]))
      players.forEach(p => { if (p.user_id) p.avatar_url = map.get(p.user_id) ?? null })
    }
    const games = (g as DoneGame[]) ?? []
    const points = new Map<string, number>()
    for (const game of games) {
      game.team1_ids.forEach(pid => points.set(pid, (points.get(pid) ?? 0) + (game.team1_score ?? 0)))
      game.team2_ids.forEach(pid => points.set(pid, (points.get(pid) ?? 0) + (game.team2_score ?? 0)))
    }
    setDetail({ players, games, points })
    setDetailLoading(false)
  }

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground/90 mb-3">
        <ArrowLeft className="w-4 h-4" /> Open Play
      </button>
      <h2 className="font-semibold text-foreground mb-1">Open Play history</h2>
      <p className="text-xs text-muted-foreground/80 mb-4">Past sessions, their games, and final standings.</p>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground/80 text-sm">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/80">
          <Swords className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm">No finished sessions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => {
            const open = openId === s.id
            const nameOf = (id: string) => detail?.players.find(p => p.id === id)?.display_name ?? '?'
            const standings = detail && open
              ? [...detail.players].map(p => ({ ...p, pts: detail.points.get(p.id) ?? 0 }))
                  .filter(p => p.games > 0)
                  .sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.losses - b.losses)
              : []
            return (
              <div key={s.id} className="border rounded-xl bg-card overflow-hidden">
                <button onClick={() => toggle(s.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate">{s.name}</span>
                      <span className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300 bg-violet-500/15 rounded-full px-2 py-0.5">{modeLabel[s.match_mode] ?? s.match_mode}</span>
                      {s.rated && <span className="text-[10px] font-bold text-green-700 dark:text-green-300 bg-green-500/15 rounded-full px-2 py-0.5">RATED</span>}
                    </div>
                    <p className="text-xs text-muted-foreground/80 mt-0.5 capitalize">{fmtDate(s.started_at)} · {s.format} · {s.court_count} courts</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground/80 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="border-t bg-gray-50/50 px-4 py-3">
                    {detailLoading ? (
                      <p className="text-xs text-muted-foreground/80 py-3 text-center">Loading results…</p>
                    ) : !detail || standings.length === 0 ? (
                      <p className="text-xs text-muted-foreground/80 py-3 text-center">No games were recorded in this session.</p>
                    ) : (
                      <>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-semibold mb-2 flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-400" />Final standings</p>
                        <div className="border rounded-lg overflow-hidden bg-card mb-3">
                          {standings.map((p, i) => (
                            <div key={p.id} className={`flex items-center gap-2.5 px-3 py-1.5 text-sm ${i > 0 ? 'border-t' : ''}`}>
                              <span className="w-5 text-center text-xs font-bold text-muted-foreground/80">{i + 1}</span>
                              <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url ?? null} size="xs" />
                              <span className="flex-1 truncate text-foreground">{p.display_name}{!p.user_id && <span className="text-[10px] text-muted-foreground/80 ml-1">guest</span>}</span>
                              <span className="text-xs text-muted-foreground/80">{p.wins}–{p.losses}</span>
                              <span className="text-sm font-bold text-foreground tabular-nums w-10 text-right">{p.pts}<span className="text-[10px] font-normal text-muted-foreground/80 ml-0.5">pts</span></span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-semibold mb-2">Games ({detail.games.length})</p>
                        <div className="space-y-1">
                          {detail.games.map((g, gi) => {
                            const w1 = g.winner_team === 1
                            return (
                              <div key={gi} className="flex items-center gap-2 text-xs bg-card border rounded-lg px-3 py-1.5">
                                <span className={`flex-1 truncate text-right ${w1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{g.team1_ids.map(nameOf).join(' & ')}</span>
                                <span className="font-bold tabular-nums text-foreground shrink-0">{g.team1_score}–{g.team2_score}</span>
                                <span className={`flex-1 truncate ${!w1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{g.team2_ids.map(nameOf).join(' & ')}</span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
