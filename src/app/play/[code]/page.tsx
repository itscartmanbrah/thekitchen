'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AppLogo } from '@/components/app-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OpenPlayQR } from '@/components/open-play-qr'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Clock, Swords, UserPlus, Check, QrCode, X, LogOut, Pause, ChevronDown, Trophy } from 'lucide-react'

interface PubPlayer {
  id: string; name: string; avatar_color: string
  status: string; queue_order: number; wins: number; losses: number; games: number
}
interface PubGame {
  id: string; court: number; team1: string[]; team2: string[]; status: string; winner_team: number | null
}
interface Payload {
  session: { id: string; name: string; format: string; court_count: number; status: string; rated: boolean; allow_self_join: boolean; league_name: string; match_mode: string } | null
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
  const [joinGender, setJoinGender] = useState<'m' | 'f' | null>(null)
  const [joinLevel, setJoinLevel] = useState<number | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [profile, setProfile] = useState<{ name: string; gender: 'm' | 'f' | null } | null>(null)

  const fetchData = useCallback(async () => {
    const { data: res } = await supabase.rpc('get_open_play_public', { p_share_code: params.code })
    setData(res as Payload)
    setLoading(false)
  }, [params.code, supabase])

  useEffect(() => {
    setMyId(localStorage.getItem(`play_${params.code}`))
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user
      const isMember = !!u && !(u as any).is_anonymous
      setSignedIn(isMember)
      // A logged-in player is matched by their account, so they're recognised
      // even on a different phone/browser where localStorage is empty.
      if (isMember && u) {
        const { data: pid } = await supabase.rpc('my_open_play_player', { p_share_code: params.code })
        if (pid) { setMyId(pid as string); localStorage.setItem(`play_${params.code}`, pid as string) }
        const { data: prof } = await supabase.from('profiles').select('display_name, first_name, last_name, gender').eq('id', u.id).single()
        if (prof) {
          const p = prof as any
          const name = (`${p.first_name ?? ''} ${p.last_name ?? ''}`).trim() || p.display_name || 'Player'
          setProfile({ name, gender: p.gender === 'male' ? 'm' : p.gender === 'female' ? 'f' : null })
        }
      }
    })
    fetchData()
    const poll = setInterval(fetchData, 5000) // live-ish without login
    return () => clearInterval(poll)
  }, [fetchData, params.code, supabase])

  const mode = data?.session?.match_mode ?? ''
  const needsGender = mode === 'mixed'
  const needsLevel = mode === 'skill' || mode === 'skill_courts'

  async function join() {
    if (!joinName.trim()) return
    if (needsGender && !joinGender) { setJoinError('Please choose Man or Woman for this mixed session.'); return }
    if (needsLevel && !joinLevel) { setJoinError('Please pick your level (1–5) for this session.'); return }
    setJoining(true); setJoinError('')
    let { data: id, error } = await supabase.rpc('join_open_play', {
      p_share_code: params.code, p_guest_name: joinName.trim(),
      p_skill_level: needsLevel ? joinLevel : null,
      p_gender: needsGender ? joinGender : null,
    })
    // Fallback for before migration 056 is applied (no 4-arg overload yet).
    if (error && /function|does not exist|schema cache|argument/i.test(error.message)) {
      ({ data: id, error } = await supabase.rpc('join_open_play', { p_share_code: params.code, p_guest_name: joinName.trim() }))
    }
    if (error) { setJoinError(error.message); setJoining(false); return }
    localStorage.setItem(`play_${params.code}`, id as string)
    setMyId(id as string)
    setJoinName(''); setJoinGender(null); setJoinLevel(null)
    await fetchData()
    setJoining(false)
  }

  // Signed-in users join in one tap — name/avatar/gender come from their profile.
  async function joinMember() {
    if (needsGender && !profile?.gender && !joinGender) { setJoinError('Please choose Man or Woman for this mixed session.'); return }
    if (needsLevel && !joinLevel) { setJoinError('Please pick your level (1–5) for this session.'); return }
    setJoining(true); setJoinError('')
    const { data: id, error } = await supabase.rpc('join_open_play_member', {
      p_share_code: params.code,
      p_skill_level: needsLevel ? joinLevel : null,
      p_gender: needsGender ? joinGender : null,
    })
    if (error) { setJoinError(error.message); setJoining(false); return }
    localStorage.setItem(`play_${params.code}`, id as string)
    setMyId(id as string)
    setJoinGender(null); setJoinLevel(null)
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

  async function rest() {
    if (!myId) return
    setJoinError('')
    const { error } = await supabase.rpc('rest_open_play', { p_player_id: myId })
    if (error) { setJoinError(error.message); return }
    await fetchData()
  }

  async function backIn() {
    if (!myId) return
    setJoinError('')
    const { error } = await supabase.rpc('backin_open_play', { p_player_id: myId })
    if (error) { setJoinError(error.message); return }
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
          <button onClick={() => setShowQr(true)} className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700">
            <QrCode className="w-4 h-4" />Invite
          </button>
        </div>
      </header>

      {showQr && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowQr(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-xs w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900">Scan to join</h2>
              <button onClick={() => setShowQr(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Have a friend scan this to check into the session.</p>
            <OpenPlayQR shareCode={params.code} />
          </div>
        </div>
      )}

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
            const resting = me.status === 'resting'
            return (
              <>
              {joinError && <p className="text-xs text-red-600 mb-2">{joinError}</p>}
              <div className={`mb-6 rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${resting ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {resting ? <Pause className="w-4 h-4 text-amber-600 shrink-0" /> : <Check className="w-4 h-4 text-green-600 shrink-0" />}
                  <span className={`text-sm truncate ${resting ? 'text-amber-800' : 'text-green-800'}`}>
                    {resting
                      ? <>Resting — <strong>{me.name}</strong>, you&apos;ll sit out until you&apos;re back.</>
                      : <>Checked in as <strong>{me.name}</strong>{me.status === 'playing' ? ' — on a court now!' : pos >= 0 ? ` — #${pos + 1} in the queue` : ''}</>}
                  </span>
                </div>
                {resting ? (
                  <Button size="sm" className="shrink-0" onClick={backIn}>I&apos;m back</Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="shrink-0">Check out<ChevronDown className="w-3.5 h-3.5 ml-1" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={rest} disabled={me.status === 'playing'}><Pause className="w-4 h-4 mr-2" />Rest — back in a few games</DropdownMenuItem>
                      <DropdownMenuItem onClick={leave} disabled={me.status === 'playing'} className="text-red-600 focus:text-red-600"><LogOut className="w-4 h-4 mr-2" />Leave the session</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              </>
            )
          }
          if (!session.allow_self_join) return null
          // Signed in → one-tap join using their account (no name to type).
          if (signedIn) {
            const askGender = needsGender && !profile?.gender
            return (
              <div className="mb-6 rounded-xl border bg-white px-4 py-3">
                <p className="text-sm font-medium text-gray-800 mb-1 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-green-600" />Join the queue
                </p>
                <p className="text-xs text-gray-500 mb-2">Signed in as <strong>{profile?.name ?? 'you'}</strong></p>
                {askGender && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500">I am a</span>
                    {(['m', 'f'] as const).map(g => (
                      <button key={g} type="button" onClick={() => { setJoinGender(g); setJoinError('') }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${joinGender === g ? 'border-green-500 bg-green-600 text-white' : 'border-gray-200 text-gray-600'}`}>
                        {g === 'm' ? 'Man' : 'Woman'}
                      </button>
                    ))}
                  </div>
                )}
                {needsLevel && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500">My level</span>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => { setJoinLevel(n); setJoinError('') }}
                        className={`w-8 h-8 rounded-lg text-sm font-semibold border ${joinLevel === n ? 'border-green-500 bg-green-600 text-white' : 'border-gray-200 text-gray-600'}`}>{n}</button>
                    ))}
                  </div>
                )}
                <Button className="w-full" onClick={joinMember} disabled={joining}>
                  {joining ? 'Checking in…' : 'Check in'}
                </Button>
                {joinError && <p className="text-xs text-red-600 mt-1.5">{joinError}</p>}
              </div>
            )
          }
          return (
            <div className="mb-6 rounded-xl border bg-white px-4 py-3">
              <p className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-green-600" />Join the queue
              </p>
              <Input placeholder="Your name" value={joinName} maxLength={40}
                onChange={e => { setJoinName(e.target.value); setJoinError('') }}
                onKeyDown={e => { if (e.key === 'Enter') join() }} />
              {needsGender && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500">I am a</span>
                  {(['m', 'f'] as const).map(g => (
                    <button key={g} type="button" onClick={() => { setJoinGender(g); setJoinError('') }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${joinGender === g ? 'border-green-500 bg-green-600 text-white' : 'border-gray-200 text-gray-600'}`}>
                      {g === 'm' ? 'Man' : 'Woman'}
                    </button>
                  ))}
                </div>
              )}
              {needsLevel && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500">My level</span>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => { setJoinLevel(n); setJoinError('') }}
                      className={`w-8 h-8 rounded-lg text-sm font-semibold border ${joinLevel === n ? 'border-green-500 bg-green-600 text-white' : 'border-gray-200 text-gray-600'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
              <Button className="w-full mt-2" onClick={join} disabled={joining || !joinName.trim()}>
                {joining ? 'Joining…' : 'Check in'}
              </Button>
              {joinError && <p className="text-xs text-red-600 mt-1.5">{joinError}</p>}
              <p className="text-xs text-gray-400 mt-1.5">
                {needsLevel ? 'Pick your level so we keep games competitive.' : needsGender ? 'Mixed doubles — every game is 2 men + 2 women.' : 'No account needed — just add your name.'}
              </p>
            </div>
          )
        })()}

        {/* Convert joined guests into accounts */}
        {myId && !signedIn && (
          <div className="mb-6 rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-white px-4 py-4">
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-green-600" />Make it count
            </p>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Create a free account to track your rating &amp; match history, join leagues, and run your own Open Play sessions.
            </p>
            <div className="flex gap-2">
              <Button asChild className="flex-1"><Link href="/signup">Create free account</Link></Button>
              <Button asChild variant="outline" className="flex-1"><Link href="/login">Sign in</Link></Button>
            </div>
          </div>
        )}

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
