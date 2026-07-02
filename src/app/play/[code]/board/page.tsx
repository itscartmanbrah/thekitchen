'use client'

import { useEffect, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/lib/supabase/client'
import { AppLogo } from '@/components/app-logo'

interface PubPlayer { id: string; name: string; avatar_color: string; status: string; queue_order: number; games: number }
interface PubGame { id: string; court: number; team1: string[]; team2: string[]; started_at: string }
interface PubGroup { id: string; team1: string[]; team2: string[] }
interface Payload {
  session: { name: string; format: string; court_count: number; status: string; rated: boolean; league_name: string } | null
  players: PubPlayer[]
  games: PubGame[]
  on_deck: PubGroup[]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function BoardViewPage({ params }: { params: { code: string } }) {
  const supabase = createClient()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  const fetchData = useCallback(async () => {
    const { data: res } = await supabase.rpc('get_open_play_public', { p_share_code: params.code })
    setData(res as Payload)
    setLoading(false)
  }, [params.code, supabase])

  useEffect(() => {
    fetchData()
    const poll = setInterval(fetchData, 4000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [fetchData])

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading…</div>
  if (!data?.session) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 px-4 text-center">This Open Play session isn&apos;t available.</div>
  }

  const { session, players, games, on_deck } = data
  const pMap = new Map(players.map(p => [p.id, p]))
  const name = (id: string) => pMap.get(id)?.name ?? '?'
  const color = (id: string) => pMap.get(id)?.avatar_color ?? '#16a34a'
  const waiting = players.filter(p => p.status === 'queued').length
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/play/${params.code}` : ''

  const mmss = (iso: string) => {
    const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const Team = ({ ids, big }: { ids: string[]; big?: boolean }) => (
    <div className="flex items-center gap-2">
      {ids.map(id => (
        <span key={id} className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${big ? 'w-9 h-9 text-sm' : 'w-6 h-6 text-[10px]'}`}
          style={{ backgroundColor: color(id) }}>{initials(name(id))}</span>
      ))}
      <span className={`font-bold text-white truncate ${big ? 'text-2xl' : 'text-sm'}`}>{ids.map(name).join(' & ')}</span>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="flex items-center justify-between px-6 sm:px-10 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <AppLogo className="w-9 h-9" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold italic uppercase tracking-tight">{session.name}</h1>
              {session.status === 'active' && <span className="flex items-center gap-1.5 text-sm font-bold text-red-400"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />LIVE</span>}
            </div>
            <p className="text-sm text-zinc-400">{session.league_name} · <span className="capitalize">{session.format}</span></p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl sm:text-4xl font-extrabold tabular-nums">{new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">{waiting} waiting</div>
        </div>
      </header>

      <main className="px-6 sm:px-10 py-6">
        {/* Courts */}
        <div className="text-xs uppercase tracking-[0.3em] text-green-400 font-bold mb-3">On the courts</div>
        <div className="grid gap-4 mb-10" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))` }}>
          {Array.from({ length: session.court_count }, (_, i) => i + 1).map(courtNo => {
            const g = games.find(x => x.court === courtNo)
            const over = g ? (now - new Date(g.started_at).getTime()) / 60000 > 15 : false
            return (
              <div key={courtNo} className={`rounded-2xl p-5 bg-zinc-900 border-l-4 ${over ? 'border-red-500' : g ? 'border-green-500' : 'border-zinc-800'}`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xl font-extrabold italic">COURT {courtNo}</span>
                  {g ? (
                    over
                      ? <span className="text-xs uppercase font-bold bg-red-500 rounded px-2 py-1">OT {mmss(g.started_at)}</span>
                      : <span className="text-lg font-bold text-green-400 tabular-nums">{mmss(g.started_at)}</span>
                  ) : <span className="text-xs uppercase tracking-widest text-zinc-600">Open</span>}
                </div>
                {g ? (
                  <div className="space-y-3">
                    <Team ids={g.team1} big />
                    <div className="text-xs font-bold text-zinc-600 pl-1">VS</div>
                    <Team ids={g.team2} big />
                  </div>
                ) : <div className="text-zinc-700 py-6 text-center text-sm">Waiting for the next group</div>}
              </div>
            )
          })}
        </div>

        {/* Up next */}
        <div className="text-xs uppercase tracking-[0.3em] text-green-400 font-bold mb-3">Up next</div>
        {on_deck.length === 0 ? (
          <p className="text-zinc-600 text-sm">No groups on deck yet.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
            {on_deck.map((grp, i) => (
              <div key={grp.id} className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-4">
                <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2">Group {i + 1}</div>
                <div className="space-y-1.5">
                  <Team ids={grp.team1} />
                  <Team ids={grp.team2} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="px-6 sm:px-10 py-4 flex items-center justify-between gap-4 border-t border-zinc-800">
        <span className="text-xs text-zinc-600">Powered by The Kitchen · updates live</span>
        {session.status === 'active' && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-wide text-green-400">Scan to join →</span>
            <div className="bg-card p-2 rounded-lg"><QRCodeSVG value={joinUrl} size={84} level="M" /></div>
          </div>
        )}
      </footer>
    </div>
  )
}
