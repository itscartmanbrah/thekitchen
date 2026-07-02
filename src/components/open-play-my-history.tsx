'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { styleInfo } from '@/components/open-play-styles'
import { ChevronDown, Trophy } from 'lucide-react'

interface HistGame { mine: number | null; theirs: number | null; won: boolean; partner: string | null; opponents: string | null; at: string }
interface HistSession {
  session_id: string; name: string; match_mode: string; format: string
  started_at: string | null; ended_at: string | null; league_name: string | null
  wins: number; losses: number; games: number; points: number; games_detail: HistGame[]
}

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export function OpenPlayMyHistory() {
  const supabase = createClient()
  const [sessions, setSessions] = useState<HistSession[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_my_open_play_history').then(({ data }) => {
      setSessions((data as HistSession[]) ?? [])
      setLoading(false)
    })
  }, [])

  const totals = sessions.reduce((a, s) => ({ games: a.games + s.games, wins: a.wins + s.wins, losses: a.losses + s.losses }), { games: 0, wins: 0, losses: 0 })
  const winRate = totals.wins + totals.losses > 0 ? Math.round((totals.wins / (totals.wins + totals.losses)) * 100) : 0

  if (loading) return <p className="text-sm text-muted-foreground/80 py-8 text-center">Loading your games…</p>
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <Trophy className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-muted-foreground">No Open Play games yet.</p>
        <p className="text-sm text-muted-foreground/80 mt-1">Join a session from a share link or host your own — your games will show up here.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Lifetime totals */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { label: 'Games', val: totals.games },
          { label: 'Record', val: `${totals.wins}–${totals.losses}` },
          { label: 'Win rate', val: `${winRate}%` },
        ].map(t => (
          <div key={t.label} className="bg-card border rounded-xl px-3 py-2.5 text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">{t.label}</div>
            <div className="text-lg font-bold text-foreground">{t.val}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {sessions.map(s => {
          const isOpen = open === s.session_id
          return (
            <div key={s.session_id} className="bg-card border rounded-xl overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : s.session_id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground truncate">{s.name}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300 bg-violet-500/15 rounded px-1.5 py-0.5">{styleInfo(s.match_mode).label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground/80">{fmtDate(s.started_at)} · {s.league_name ?? 'Standalone'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-foreground tabular-nums">{s.wins}–{s.losses}</div>
                  <div className="text-[10px] text-muted-foreground/80">{s.points} pts · {s.games}g</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground/50 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t bg-gray-50/60 px-4 py-2 space-y-1.5">
                  {s.games_detail.length === 0 && <p className="text-xs text-muted-foreground/80 py-2">No completed games recorded.</p>}
                  {s.games_detail.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm py-1">
                      <span className={`text-[10px] font-bold uppercase w-9 ${g.won ? 'text-primary' : 'text-muted-foreground/80'}`}>{g.won ? 'Win' : 'Loss'}</span>
                      <span className="flex-1 min-w-0 truncate text-foreground/90">
                        {g.partner && <span className="text-muted-foreground/80">w/ {g.partner} </span>}
                        vs <span className="text-foreground">{g.opponents ?? '—'}</span>
                      </span>
                      {g.mine != null && g.theirs != null && (
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{g.mine}–{g.theirs}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
