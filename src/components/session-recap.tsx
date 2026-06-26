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
  balanced: 'Drop-in', skill: 'Skill-separated', mixed: 'Mixed Doubles', ladder: 'King of the Court',
  king: 'King of the Court', americano: 'Americano', mexicano: 'Mexicano',
}
const initials = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

// Shareable end-of-session card: standings, MVP, stats + a "create your own" CTA.
export function SessionRecap({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const supabase = createClient()
  const storyRef = useRef<HTMLDivElement>(null)   // the 1080×1920 export frame
  const [sess, setSess] = useState<Sess | null>(null)
  const [standings, setStandings] = useState<(SP & { pts: number })[]>([])
  const [gameCount, setGameCount] = useState(0)
  const [loading, setLoading] = useState(true)
  // Pre-rendered image (built once the frame is mounted) so that on iOS the
  // share sheet can open synchronously inside the tap — otherwise Safari drops
  // the user-gesture during the async render and the share/save silently fails.
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgFile, setImgFile] = useState<File | null>(null)

  const fileName = `${(sess?.name ?? 'open-play').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-recap.png`

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

  // Render the 1080×1920 story frame to a PNG, ready for an instant save/share.
  useEffect(() => {
    if (loading || !storyRef.current) return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const url = await toPng(storyRef.current!, { pixelRatio: 1, backgroundColor: '#0b1220', width: 1080, height: 1920 })
        if (!alive) return
        setImgUrl(url)
        const blob = await (await fetch(url)).blob()
        if (alive) setImgFile(new File([blob], fileName, { type: 'image/png' }))
      } catch { /* ignore — buttons fall back to on-demand render */ }
    }, 450)
    return () => { alive = false; clearTimeout(t) }
  }, [loading, fileName])

  const isMobile = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  async function saveImage() {
    try {
      // Mobile (esp. iOS): the share sheet's "Save Image" is the only reliable
      // way to get the PNG into the camera roll — <a download> is ignored there.
      if (isMobile && imgFile && navigator.canShare?.({ files: [imgFile] })) {
        await navigator.share({ files: [imgFile], title: 'The Kitchen — Open Play' })
        return
      }
      const url = imgUrl ?? (storyRef.current ? await toPng(storyRef.current, { pixelRatio: 1, backgroundColor: '#0b1220', width: 1080, height: 1920 }) : null)
      if (!url) return
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
    } catch { /* user dismissed the share sheet */ }
  }

  async function share() {
    const top = standings[0]?.display_name
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const text = `${sess?.name ?? 'Open Play'} 🏆${top ? ` — ${top} took the crown!` : ''} Run your own free session:`
    try {
      // share the image too when supported, so a single tap posts the card
      if (isMobile && imgFile && navigator.canShare?.({ files: [imgFile] })) {
        await navigator.share({ files: [imgFile], title: 'The Kitchen — Open Play', text })
        return
      }
      if (navigator.share) await navigator.share({ title: 'The Kitchen — Open Play', text, url: `${origin}/play/new` })
      else await navigator.clipboard.writeText(`${text} ${origin}/play/new`)
    } catch { /* cancelled */ }
  }

  const mvp = standings[0]
  const modeName = modeLabel[sess?.match_mode ?? ''] ?? sess?.match_mode

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-sm my-auto" onClick={e => e.stopPropagation()}>
        {/* On-screen preview (compact). The saved/shared image is the story frame below. */}
        <div className="bg-slate-900 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><AppLogo className="w-6 h-6" /><span className="font-bold">The Kitchen</span></div>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Open Play</span>
          </div>
          <h2 className="text-2xl font-extrabold italic uppercase tracking-tight leading-none">{sess?.name ?? 'Session'}</h2>
          <div className="flex items-center gap-2 mt-2 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wide text-violet-300 bg-violet-500/20 rounded px-2 py-0.5">{modeName}</span>
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
          <p className="text-[11px] text-slate-500 text-center mt-4">Saves as a 1080×1920 story image — perfect for Facebook / Instagram Stories.</p>
        </div>

        {/* Actions (not part of the image) */}
        <div className="flex gap-2 mt-3">
          <Button variant="outline" className="flex-1 bg-white" onClick={saveImage}><Download className="w-4 h-4 mr-1" />Save image</Button>
          <Button className="flex-1" onClick={share}><Share2 className="w-4 h-4 mr-1" />Share</Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
      </div>

      {/* ── Hidden 1080×1920 story frame (the actual exported image) ───────────── */}
      <div aria-hidden style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        <div ref={storyRef} style={{ width: 1080, height: 1920 }}
          className="flex flex-col justify-between bg-gradient-to-b from-slate-900 to-slate-950 text-white"
          // generous safe margins for Story UI (top/bottom)
        >
          <div style={{ padding: '120px 96px 96px' }} className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <AppLogo className="w-[72px] h-[72px]" />
                <span className="text-[48px] font-extrabold tracking-tight">The Kitchen</span>
              </div>
              <span className="text-[24px] uppercase tracking-[0.3em] text-green-400 font-bold">Open Play</span>
            </div>

            {/* Title */}
            <div className="mt-[80px]">
              <div className="text-[26px] uppercase tracking-[0.32em] text-slate-500 font-bold mb-4">Session Recap</div>
              <h1 className="text-[96px] font-extrabold italic uppercase tracking-tight leading-[0.92]">{sess?.name ?? 'Session'}</h1>
              <div className="flex items-center gap-4 mt-8">
                <span className="text-[28px] font-bold uppercase tracking-wide text-violet-200 bg-violet-500/25 rounded-xl px-5 py-2">{modeName}</span>
                <span className="text-[30px] text-slate-400 capitalize">{sess?.format} · {gameCount} games · {standings.length} players</span>
              </div>
            </div>

            {/* MVP */}
            {mvp && (
              <div className="mt-[72px] rounded-3xl bg-gradient-to-br from-amber-500/25 to-amber-600/10 border-2 border-amber-500/40 px-10 py-8 flex items-center gap-7">
                <Crown className="w-[80px] h-[80px] text-amber-300 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[26px] uppercase tracking-[0.3em] text-amber-300 font-bold">MVP</div>
                  <div className="text-[58px] font-extrabold leading-tight truncate">{mvp.display_name}</div>
                </div>
                <div className="ml-auto text-right shrink-0">
                  <div className="text-[80px] font-extrabold leading-none">{mvp.pts}</div>
                  <div className="text-[26px] text-amber-200/80">points</div>
                </div>
              </div>
            )}

            {/* Standings */}
            <div className="mt-[64px] flex-1">
              <div className="text-[26px] uppercase tracking-[0.3em] text-green-400 font-bold mb-6">Final Standings</div>
              <div className="flex flex-col gap-4">
                {standings.slice(0, 8).map((p, i) => (
                  <div key={p.id} className={`flex items-center gap-6 rounded-2xl px-7 py-5 ${i === 0 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-800/70'}`}>
                    <span className="w-[44px] text-center text-[34px] font-extrabold text-slate-500">{i + 1}</span>
                    <span className="w-[68px] h-[68px] rounded-full flex items-center justify-center text-white text-[28px] font-bold shrink-0" style={{ backgroundColor: p.avatar_color }}>{initials(p.display_name)}</span>
                    <span className="flex-1 text-[40px] text-slate-100 font-semibold truncate">{p.display_name}</span>
                    <span className="text-[30px] text-slate-500 tabular-nums">{p.wins}–{p.losses}</span>
                    <span className="text-[46px] font-extrabold tabular-nums w-[120px] text-right">{p.pts}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer CTA */}
            <div className="mt-[64px] text-center">
              <div className="text-[40px] font-extrabold">Run your own free Open Play</div>
              <div className="text-[28px] text-slate-400 mt-2">No sign-up · players join from a link · The Kitchen</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
