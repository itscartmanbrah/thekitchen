'use client'

import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { createClient } from '@/lib/supabase/client'
import { AppLogo } from '@/components/app-logo'
import { Button } from '@/components/ui/button'
import { Download, Share2, X, Crown } from 'lucide-react'

interface SP { id: string; display_name: string; avatar_color: string; user_id: string | null; wins: number; losses: number; games: number }
interface DoneGame { team1_ids: string[]; team2_ids: string[]; team1_score: number | null; team2_score: number | null }
interface Sess { name: string; match_mode: string; format: string; started_at: string | null }

const modeLabel: Record<string, string> = {
  balanced: 'Drop-in', skill: 'Drop-in', mixed: 'Drop-in', ladder: 'King of the Court',
  king: 'King of the Court', americano: 'Americano', mexicano: 'Mexicano',
}
const initials = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

// Shareable end-of-session card: standings, MVP, stats + a "create your own" CTA.
export function SessionRecap({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const supabase = createClient()
  const cardRef = useRef<HTMLDivElement>(null)
  const [sess, setSess] = useState<Sess | null>(null)
  const [standings, setStandings] = useState<(SP & { pts: number })[]>([])
  const [gameCount, setGameCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: s }, { data: sp }, { data: g }] = await Promise.all([
        supabase.from('play_sessions').select('name, match_mode, format, started_at').eq('id', sessionId).single(),
        supabase.from('session_players').select('id, display_name, avatar_color, user_id, wins, losses, games').eq('session_id', sessionId),
        supabase.from('session_games').select('team1_ids, team2_ids, team1_score, team2_score').eq('session_id', sessionId).eq('status', 'completed'),
      ])
      setSess(s as Sess)
      const players = (sp as SP[]) ?? []
      const games = (g as DoneGame[]) ?? []
      const pts = new Map<string, number>()
      for (const gm of games) {
        gm.team1_ids.forEach(id => pts.set(id, (pts.get(id) ?? 0) + (gm.team1_score ?? 0)))
        gm.team2_ids.forEach(id => pts.set(id, (pts.get(id) ?? 0) + (gm.team2_score ?? 0)))
      }
      setStandings(players.map(p => ({ ...p, pts: pts.get(p.id) ?? 0 })).filter(p => p.games > 0)
        .sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.losses - b.losses))
      setGameCount(games.length)
      setLoading(false)
    }
    load()
  }, [sessionId])

  async function saveImage() {
    if (!cardRef.current) return
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#0f172a' })
      const a = document.createElement('a')
      a.href = url
      a.download = `${(sess?.name ?? 'open-play').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-recap.png`
      a.click()
    } catch { /* ignore */ }
  }

  async function share() {
    const mvp = standings[0]?.display_name
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const text = `${sess?.name ?? 'Open Play'} 🏆${mvp ? ` — ${mvp} took the crown!` : ''} Run your own free session:`
    try {
      if (navigator.share) await navigator.share({ title: 'The Kitchen — Open Play', text, url: `${origin}/play/new` })
      else { await navigator.clipboard.writeText(`${text} ${origin}/play/new`) }
    } catch { /* cancelled */ }
  }

  const mvp = standings[0]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-sm my-auto" onClick={e => e.stopPropagation()}>
        {/* The shareable card */}
        <div ref={cardRef} className="bg-slate-900 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><AppLogo className="w-6 h-6" /><span className="font-bold">The Kitchen</span></div>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Open Play</span>
          </div>
          <h2 className="text-2xl font-extrabold italic uppercase tracking-tight leading-none">{sess?.name ?? 'Session'}</h2>
          <div className="flex items-center gap-2 mt-2 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wide text-violet-300 bg-violet-500/20 rounded px-2 py-0.5">{modeLabel[sess?.match_mode ?? ''] ?? sess?.match_mode}</span>
            <span className="text-xs text-slate-400 capitalize">{sess?.format} · {gameCount} games · {standings.length} players</span>
          </div>

          {loading ? (
            <p className="text-slate-500 text-sm py-6 text-center">Tallying results…</p>
          ) : standings.length === 0 ? (
            <p className="text-slate-500 text-sm py-6 text-center">No games were recorded.</p>
          ) : (
            <>
              {mvp && (
                <div className="rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 p-3 mb-3 flex items-center gap-3">
                  <Crown className="w-6 h-6 text-amber-300 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">MVP</div>
                    <div className="font-bold truncate">{mvp.display_name}</div>
                  </div>
                  <div className="ml-auto text-right shrink-0"><div className="text-xl font-extrabold">{mvp.pts}</div><div className="text-[10px] text-amber-200/70">pts</div></div>
                </div>
              )}
              <div className="space-y-1">
                {standings.slice(0, 6).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2.5 text-sm">
                    <span className="w-4 text-center text-xs font-bold text-slate-500">{i + 1}</span>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0" style={{ backgroundColor: p.avatar_color }}>{initials(p.display_name)}</span>
                    <span className="flex-1 truncate text-slate-100">{p.display_name}</span>
                    <span className="text-xs text-slate-500">{p.wins}–{p.losses}</span>
                    <span className="font-bold tabular-nums w-9 text-right">{p.pts}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="text-[11px] text-slate-500 text-center mt-4">Run your own free Open Play — no signup · thekitchen</p>
        </div>

        {/* Actions (not part of the image) */}
        <div className="flex gap-2 mt-3">
          <Button variant="outline" className="flex-1 bg-white" onClick={saveImage}><Download className="w-4 h-4 mr-1" />Save image</Button>
          <Button className="flex-1" onClick={share}><Share2 className="w-4 h-4 mr-1" />Share</Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
      </div>
    </div>
  )
}
