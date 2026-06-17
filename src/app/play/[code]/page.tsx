'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AppLogo } from '@/components/app-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clock, Swords, UserPlus, Check } from 'lucide-react'

interface PubPlayer {
  id: string; name: string; avatar_color: string
  status: string; queue_order: number; wins: number; losses: number; games: number
}
interface PubGame {
  id: string; court: number; team1: string[]; team2: string[]; status: string; winner_team: number | null
}
interface Payload {
  session: { id: string; name: string; format: string; court_count: number; status: string; rated: boolean; allow_self_join: boolean; league_name: string } | null
  players: PubPlayer[]
  games: PubGame[]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function PublicPlayPage({ params }: { params: { code: string } }) {
  const supabase = createClient()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const fetchData = useCallback(async () => {
    const { data: res } = await supabase.rpc('get_open_play_public', { p_share_code: params.code })
    setData(res as Payload)
    setLoading(false)
  }, [params.code, supabase])

  useEffect(() => {
    setMyId(localStorage.getItem(`play_${params.code}`))
    fetchData()
    const poll = setInterval(fetchData, 5000) // live-ish without login
    return () => clearInterval(poll)
  }, [fetchData, params.code])

  async function join() {
    if (!joinName.trim()) return
    setJoining(true); setJoinError('')
    const { data: id, error } = await supabase.rpc('join_open_play', { p_share_code: params.code, p_guest_name: joinName.trim() })
    if (error) { setJoinError(error.message); setJoining(false); return }
    localStorage.setItem(`play_${params.code}`, id as string)
    setMyId(id as string)
    setJoinName('')
    await fetchData()
    setJoining(false)
  }

  async function leave() {
    if (!myId) return
    const { error } = await supabase.rpc('leave_open_play', { p_player_id: myId })
    if (error) { setJoinError(error.message); return }
    localStorage.removeItem(`play_${params.code}`)
    setMyId(null)
    await fetchData()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  if (!data?.session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 px-4 text-center">
        This Open Play session isn&apos;t available. Ask the organiser for the current link.
      </div>
    )
  }

  const { session, players, games } = data
  const pMap = new Map(players.map(p => [p.id, p]))
  const queued = players.filter(p => p.status === 'queued').sort((a, b) => a.queue_order - b.queue_order)
  const name = (id: string) => pMap.get(id)?.name ?? '?'
  const color = (id: string) => pMap.get(id)?.avatar_color ?? '#16a34a'

  const Avatar = ({ id }: { id: string }) => (
    <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
      style={{ backgroundColor: color(id) }}>{initials(name(id))}</span>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <AppLogo className="w-7 h-7" />
            <span className="font-bold text-gray-900">The Kitchen</span>
          </Link>
          <span className="text-xs text-gray-400">Live · updates every few seconds</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            {session.name}
            {session.rated && <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">RATED</span>}
          </h1>
          <p className="text-sm text-gray-500">
            {session.league_name} · <span className="capitalize">{session.format}</span>
            {session.status === 'ended' && <span className="ml-2 text-amber-600 font-medium">Session ended</span>}
          </p>
        </div>

        {/* Self check-in */}
        {session.status === 'active' && (() => {
          const me = myId ? players.find(p => p.id === myId) : null
          if (me) {
            const pos = queued.findIndex(p => p.id === me.id)
            return (
              <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Check className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="text-sm text-green-800 truncate">
                    You&apos;re checked in as <strong>{me.name}</strong>
                    {me.status === 'playing'
                      ? ' — you&apos;re on a court now!'
                      : pos >= 0 ? ` — #${pos + 1} in the queue` : ''}
                  </span>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={leave} disabled={me.status === 'playing'}>
                  Leave
                </Button>
              </div>
            )
          }
          if (!session.allow_self_join) return null
          return (
            <div className="mb-6 rounded-xl border bg-white px-4 py-3">
              <p className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-green-600" />Join the queue
              </p>
              <div className="flex gap-2">
                <Input placeholder="Your name" value={joinName} maxLength={40}
                  onChange={e => { setJoinName(e.target.value); setJoinError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') join() }} />
                <Button onClick={join} disabled={joining || !joinName.trim()}>
                  {joining ? 'Joining…' : 'Check in'}
                </Button>
              </div>
              {joinError && <p className="text-xs text-red-600 mt-1.5">{joinError}</p>}
              <p className="text-xs text-gray-400 mt-1.5">No account needed — just add your name.</p>
            </div>
          )
        })()}

        {/* Courts */}
        <p className="text-xs font-semibold text-gray-500 mb-2">On the courts now</p>
        <div className="grid gap-2 sm:grid-cols-2 mb-6">
          {Array.from({ length: session.court_count }, (_, i) => i + 1).map(courtNo => {
            const g = games.find(x => x.court === courtNo)
            return (
              <div key={courtNo} className="border rounded-xl p-3 bg-white">
                <p className="text-xs font-semibold text-gray-400 mb-2">Court {courtNo}</p>
                {g ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {g.team1.map(id => <Avatar key={id} id={id} />)}
                      <span className="text-xs font-medium text-gray-800 truncate">{g.team1.map(name).join(' & ')}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-gray-300"><Swords className="w-3 h-3" /></div>
                    <div className="flex items-center gap-1.5">
                      {g.team2.map(id => <Avatar key={id} id={id} />)}
                      <span className="text-xs font-medium text-gray-800 truncate">{g.team2.map(name).join(' & ')}</span>
                    </div>
                  </div>
                ) : <div className="text-xs text-gray-300 py-3 text-center">Open</div>}
              </div>
            )
          })}
        </div>

        {/* Queue */}
        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />Up next ({queued.length})
        </p>
        <div className="space-y-1.5">
          {queued.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-2.5 border rounded-lg px-3 py-2 ${p.id === myId ? 'bg-green-50 border-green-300' : 'bg-white'}`}>
              <span className="text-xs text-gray-400 w-5">{i + 1}</span>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                style={{ backgroundColor: p.avatar_color }}>{initials(p.name)}</span>
              <span className="text-sm text-gray-800 flex-1 truncate">{p.name}</span>
              <span className="text-xs text-gray-400">{p.wins}W {p.losses}L</span>
            </div>
          ))}
          {queued.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">Nobody waiting right now.</p>}
        </div>

        <p className="text-xs text-gray-400 text-center mt-8">
          Powered by The Kitchen.{' '}
          <Link href="/signup" className="text-green-600 hover:underline">Create your own league</Link>
        </p>
      </main>
    </div>
  )
}
