'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { buildMatches, playersNeeded, type QueuePlayer } from '@/lib/open-play'
import {
  Play, Plus, UserPlus, Link2, Check, Trophy, Clock, Pause, LogOut, X, Swords,
} from 'lucide-react'

interface SessionRow {
  id: string
  name: string
  court_count: number
  format: 'singles' | 'doubles'
  match_mode: string
  rated: boolean
  status: 'scheduled' | 'active' | 'ended'
  share_code: string
  allow_self_join: boolean
  starts_at: string | null
  ends_at: string | null
  court_ids: string[] | null
}
interface Court { id: string; name: string }
interface SP {
  id: string
  user_id: string | null
  display_name: string
  avatar_color: string
  avatar_url?: string | null
  skill: number
  status: 'queued' | 'playing' | 'resting' | 'left'
  queue_order: number
  wins: number
  losses: number
  games: number
}
interface Game {
  id: string
  court_number: number
  team1_ids: string[]
  team2_ids: string[]
  status: 'in_progress' | 'completed'
}
interface Member { user_id: string; profiles: { display_name: string; avatar_color: string; avatar_url: string | null } }

export function LeagueOpenPlay({ leagueId, isOrganizer }: { leagueId: string; isOrganizer: boolean }) {
  const [session, setSession] = useState<SessionRow | null>(null)
  const [players, setPlayers] = useState<SP[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // setup
  const [setupName, setSetupName] = useState('')
  const [courts, setCourts] = useState<Court[]>([])
  const [selectedCourts, setSelectedCourts] = useState<string[]>([])
  const [format, setFormat] = useState<'singles' | 'doubles'>('doubles')
  const [rated, setRated] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  // add player
  const [addOpen, setAddOpen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [guestName, setGuestName] = useState('')

  const { toast } = useToast()
  const supabase = createClient()

  async function fetchActive() {
    const nowIso = new Date().toISOString()
    // most recent session that hasn't finished (scheduled or running)
    const { data: s } = await supabase
      .from('play_sessions').select('*')
      .eq('league_id', leagueId)
      .is('ended_at', null)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order('starts_at', { ascending: false }).limit(1).maybeSingle()
    setSession((s as SessionRow) ?? null)
    if (s) await loadState((s as SessionRow).id)
    setLoading(false)
  }

  async function loadState(sessionId: string) {
    const [{ data: sp }, { data: g }] = await Promise.all([
      supabase.from('session_players').select('*').eq('session_id', sessionId).order('queue_order'),
      supabase.from('session_games').select('*').eq('session_id', sessionId).eq('status', 'in_progress').order('court_number'),
    ])
    // attach avatar_url for members
    const rows = (sp as SP[]) ?? []
    const memberIds = rows.filter(r => r.user_id).map(r => r.user_id as string)
    if (memberIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, avatar_url').in('id', memberIds)
      const map = new Map(((profs ?? []) as any[]).map(p => [p.id, p.avatar_url]))
      rows.forEach(r => { if (r.user_id) r.avatar_url = map.get(r.user_id) ?? null })
    }
    setPlayers(rows)
    setGames((g as Game[]) ?? [])
  }

  useEffect(() => {
    fetchActive()
    supabase.from('courts').select('id, name').eq('league_id', leagueId).eq('active', true).order('created_at')
      .then(({ data }) => setCourts((data as Court[]) ?? []))
  }, [leagueId])

  const isScheduled = !!session && !!session.starts_at && new Date(session.starts_at).getTime() > Date.now()

  const playerMap = new Map(players.map(p => [p.id, p]))
  const queued = players.filter(p => p.status === 'queued').sort((a, b) => a.queue_order - b.queue_order)
  const playing = players.filter(p => p.status === 'playing')
  const resting = players.filter(p => p.status === 'resting')
  const openCourts = session ? session.court_count - games.length : 0

  // ── actions ───────────────────────────────────────────────────────────────
  async function startSession() {
    if (!setupName.trim()) { toast({ title: 'Name the session', variant: 'destructive' }); return }
    if (selectedCourts.length === 0) { toast({ title: 'Select at least one court', variant: 'destructive' }); return }
    if (!startTime || !endTime) { toast({ title: 'Set a start and end time', variant: 'destructive' }); return }

    const day = startDate || new Date().toISOString().split('T')[0]
    const startsAt = new Date(`${day}T${startTime}`)
    const endsAt = new Date(`${day}T${endTime}`)
    if (endsAt <= startsAt) { toast({ title: 'End time must be after start time', variant: 'destructive' }); return }

    setBusy(true)
    const { error } = await supabase.rpc('create_play_session', {
      p_league_id: leagueId, p_name: setupName.trim(), p_court_ids: selectedCourts,
      p_format: format, p_match_mode: 'balanced', p_rated: rated,
      p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString(),
      p_allow_self_join: true,
    })
    if (error) toast({ title: 'Could not create', description: error.message, variant: 'destructive' })
    else {
      toast({ title: startsAt.getTime() > Date.now() ? 'Session scheduled 📅' : 'Session started 🎾' })
      setSetupName(''); setSelectedCourts([]); setStartDate(''); setStartTime(''); setEndTime('')
      await fetchActive()
    }
    setBusy(false)
  }

  async function openAdd() {
    setAddOpen(true)
    const { data } = await supabase
      .from('league_members')
      .select('user_id, profiles(display_name, avatar_color, avatar_url)')
      .eq('league_id', leagueId).eq('status', 'active')
    setMembers((data as unknown as Member[]) ?? [])
  }

  async function addMember(userId: string) {
    const { error } = await supabase.rpc('add_session_player', {
      p_session_id: session!.id, p_user_id: userId, p_guest_name: null, p_skill: null,
    })
    if (error) toast({ title: 'Could not add', description: error.message, variant: 'destructive' })
    else loadState(session!.id)
  }

  async function addGuest() {
    if (!guestName.trim()) return
    const { error } = await supabase.rpc('add_session_player', {
      p_session_id: session!.id, p_user_id: null, p_guest_name: guestName.trim(), p_skill: null,
    })
    if (error) toast({ title: 'Could not add guest', description: error.message, variant: 'destructive' })
    else { setGuestName(''); loadState(session!.id) }
  }

  async function fillCourts() {
    if (!session) return
    const q: QueuePlayer[] = queued.map(p => ({ id: p.id, skill: p.skill }))
    const { pairings } = buildMatches(q, session.format, openCourts)
    if (pairings.length === 0) {
      toast({ title: 'Not enough players in the queue', variant: 'destructive' })
      return
    }
    setBusy(true)
    // assign to the lowest-numbered free courts
    const occupied = new Set(games.map(g => g.court_number))
    let court = 1
    for (const p of pairings) {
      while (occupied.has(court)) court++
      occupied.add(court)
      const { error } = await supabase.rpc('create_session_game', {
        p_session_id: session.id, p_court: court, p_team1: p.team1, p_team2: p.team2,
      })
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); break }
    }
    await loadState(session.id)
    setBusy(false)
  }

  async function recordWinner(game: Game, winner: 1 | 2) {
    const { error } = await supabase.rpc('complete_session_game', { p_game_id: game.id, p_winner: winner })
    if (error) { toast({ title: 'Could not record', description: error.message, variant: 'destructive' }); return }
    await loadState(session!.id)
  }

  async function setStatus(playerId: string, status: string) {
    const { error } = await supabase.rpc('set_session_player_status', { p_player_id: playerId, p_status: status })
    if (!error) loadState(session!.id)
  }

  async function toggleSelfJoin() {
    if (!session) return
    const { error } = await supabase.rpc('set_session_self_join', { p_session_id: session.id, p_allow: !session.allow_self_join })
    if (error) toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
    else setSession({ ...session, allow_self_join: !session.allow_self_join })
  }

  async function endSession() {
    if (!session) return
    const { error } = await supabase.rpc('end_play_session', { p_session_id: session.id })
    if (error) toast({ title: 'Could not end', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Session ended' }); fetchActive() }
  }

  function copyShare() {
    if (!session) return
    navigator.clipboard.writeText(`${window.location.origin}/play/${session.share_code}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    toast({ title: 'Player link copied!', description: 'Players can follow the queue on their phones — no login needed.' })
  }

  const nameOf = (id: string) => playerMap.get(id)?.display_name ?? '?'
  const avatarOf = (id: string) => playerMap.get(id)

  if (loading) return <div className="text-center py-12 text-gray-500">Loading…</div>

  // ── No active session ───────────────────────────────────────────────────────
  if (!session) {
    if (!isOrganizer) {
      return (
        <div className="text-center py-16 text-gray-400">
          <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No Open Play session running right now.</p>
        </div>
      )
    }
    return (
      <div className="max-w-md">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-semibold text-gray-900">Start an Open Play session</h2>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Check players in, auto-balance courts, and rotate the queue.{' '}
          <Link href="/open-play-guide" className="underline hover:text-green-600">How it works</Link>
        </p>
        {courts.length === 0 ? (
          <div className="border rounded-xl p-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
            Add a court first (on the <strong>Courts</strong> tab) — Open Play runs on your courts and blocks them from booking during the session.
          </div>
        ) : (
        <div className="space-y-4 border rounded-xl p-4 bg-white">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Session name</Label>
            <Input id="s-name" placeholder="e.g. Thursday Night Open Play" value={setupName} onChange={e => setSetupName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Courts used</Label>
            <div className="flex flex-wrap gap-1.5">
              {courts.map(c => {
                const on = selectedCourts.includes(c.id)
                return (
                  <button key={c.id} type="button"
                    onClick={() => setSelectedCourts(prev => on ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${on ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600'}`}>
                    {c.name}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400">These courts are blocked from booking during the session.</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={startDate} min={new Date().toISOString().split('T')[0]}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-2">Leave the date as today to start now. The session auto-finishes at the end time.</p>

          <div className="space-y-1.5">
            <Label>Format</Label>
            <div className="flex gap-1">
              {(['doubles', 'singles'] as const).map(f => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  className={`flex-1 text-sm py-2 rounded-lg border capitalize ${format === f ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={rated} onChange={e => setRated(e.target.checked)} className="mt-0.5" />
            <span className="text-sm text-gray-700">
              <span className="font-medium">Rated session</span>
              <span className="block text-xs text-gray-400">Games between league members count toward ELO. Guest games are always casual.</span>
            </span>
          </label>
          <Button onClick={startSession} disabled={busy} className="w-full">
            <Play className="w-4 h-4 mr-1" />{busy ? 'Saving…' : 'Create session'}
          </Button>
        </div>
        )}
      </div>
    )
  }

  // ── Active session (organizer console) ──────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            {session.name}
            {session.rated && <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">RATED</span>}
            {isScheduled && <span className="text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">SCHEDULED</span>}
          </h2>
          <p className="text-xs text-gray-400 capitalize">
            {session.format} · {session.court_count} courts
            {session.starts_at && session.ends_at && (
              <span className="normal-case"> · {new Date(session.starts_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}–{new Date(session.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copyShare}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}Share
          </Button>
          {isOrganizer && <Button size="sm" variant="outline" onClick={openAdd}><UserPlus className="w-3.5 h-3.5 mr-1" />Add</Button>}
          {isOrganizer && <Button size="sm" variant="ghost" className="text-red-500" onClick={endSession}>End</Button>}
        </div>
      </div>

      {isOrganizer && (
        <label className="flex items-center gap-2 mb-4 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={session.allow_self_join} onChange={toggleSelfJoin} />
          <span>Let players check themselves in from the share link (no account needed)</span>
        </label>
      )}

      {/* Courts board */}
      <div className="grid gap-2 sm:grid-cols-2 mb-4">
        {Array.from({ length: session.court_count }, (_, i) => i + 1).map(courtNo => {
          const game = games.find(g => g.court_number === courtNo)
          return (
            <div key={courtNo} className="border rounded-xl p-3 bg-white">
              <p className="text-xs font-semibold text-gray-400 mb-2">Court {courtNo}</p>
              {game ? (
                <div className="space-y-2">
                  {[1, 2].map(team => {
                    const ids = team === 1 ? game.team1_ids : game.team2_ids
                    return (
                      <button
                        key={team}
                        disabled={!isOrganizer}
                        onClick={() => isOrganizer && recordWinner(game, team as 1 | 2)}
                        className={`w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left ${isOrganizer ? 'hover:bg-green-50 hover:border-green-300 border border-transparent' : ''}`}
                        title={isOrganizer ? 'Tap if this team won' : undefined}
                      >
                        {ids.map(id => {
                          const p = avatarOf(id)
                          return p ? <PlayerAvatar key={id} name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url ?? null} size="xs" /> : null
                        })}
                        <span className="text-xs font-medium text-gray-800 truncate">{ids.map(nameOf).join(' & ')}</span>
                      </button>
                    )
                  })}
                  {isOrganizer && <p className="text-[10px] text-center text-gray-400">Tap the winning team</p>}
                </div>
              ) : (
                <div className="text-xs text-gray-300 py-3 text-center">Open</div>
              )}
            </div>
          )
        })}
      </div>

      {isOrganizer && openCourts > 0 && (
        <Button size="sm" onClick={fillCourts} disabled={busy || queued.length < (session.format === 'doubles' ? 4 : 2)} className="mb-4">
          <Plus className="w-4 h-4 mr-1" />Fill {openCourts} open court{openCourts > 1 ? 's' : ''}
        </Button>
      )}

      {/* Queue */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />In the queue ({queued.length})
          {playersNeeded(queued.length, session.format) > 0 && openCourts > 0 && (
            <span className="text-gray-400 font-normal">· need {playersNeeded(queued.length, session.format)} more for a court</span>
          )}
        </p>
        <div className="space-y-1.5">
          {queued.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2.5 bg-white border rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400 w-4">{i + 1}</span>
              <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url ?? null} size="xs" />
              <span className="text-sm text-gray-800 flex-1 truncate">
                {p.display_name}
                {!p.user_id && <span className="text-[10px] text-gray-400 ml-1">guest</span>}
              </span>
              <span className="text-xs text-gray-400">{p.wins}W {p.losses}L</span>
              {isOrganizer && (
                <>
                  <button onClick={() => setStatus(p.id, 'resting')} className="text-gray-300 hover:text-amber-500" title="Rest">
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setStatus(p.id, 'left')} className="text-gray-300 hover:text-red-500" title="Remove">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
          {queued.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">Queue is empty — add players to get going.</p>}
        </div>
      </div>

      {/* Resting */}
      {resting.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-gray-500 mb-2">Resting ({resting.length})</p>
          <div className="space-y-1.5">
            {resting.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 bg-gray-50 border rounded-lg px-3 py-2">
                <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url ?? null} size="xs" />
                <span className="text-sm text-gray-600 flex-1 truncate">{p.display_name}</span>
                {isOrganizer && (
                  <button onClick={() => setStatus(p.id, 'queued')} className="text-xs text-green-600 hover:underline">Back in</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add player dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add players</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Add a guest</Label>
              <div className="flex gap-2">
                <Input placeholder="Guest name" value={guestName} onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addGuest() }} />
                <Button onClick={addGuest} disabled={!guestName.trim()}>Add</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>League members</Label>
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {members.filter(m => !players.some(p => p.user_id === m.user_id && p.status !== 'left')).map(m => (
                  <button key={m.user_id} onClick={() => addMember(m.user_id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-green-400 text-left">
                    <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} imageUrl={m.profiles.avatar_url} size="sm" />
                    <span className="text-sm flex-1 truncate">{m.profiles.display_name}</span>
                    <Plus className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
