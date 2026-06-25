'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRealtime } from '@/lib/use-realtime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { buildFairGroups, buildMexicanoRound, buildKingRound, type RosterPlayer, type CourtResult } from '@/lib/open-play'
import { LeagueOpenPlayHistory } from '@/components/leagues/league-open-play-history'
import { OpenPlayQR } from '@/components/open-play-qr'
import { setActiveHost, clearActiveHost } from '@/lib/active-host'
import {
  Play, Plus, UserPlus, Link2, Check, Pause, X, Swords,
  ArrowLeft, CalendarDays, Wand2, Lock, Unlock, Repeat, Trash2, Monitor,
  Volume2, VolumeX, Star, Search, History, QrCode,
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
  manage_code: string
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
  status: 'queued' | 'playing' | 'resting' | 'left' | 'staged'
  queue_order: number
  queued_since: string
  wins: number
  losses: number
  games: number
}
interface Game {
  id: string
  court_number: number | null
  team1_ids: string[]
  team2_ids: string[]
  status: 'staged' | 'in_progress' | 'completed'
  locked: boolean
  started_at: string
  rank: number | null
  round_no: number | null
}
interface Member { user_id: string; profiles: { display_name: string; avatar_color: string; avatar_url: string | null } }

export function LeagueOpenPlay({ leagueId, isOrganizer, solo = false }: { leagueId: string | null; isOrganizer: boolean; solo?: boolean }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [isAnon, setIsAnon] = useState(false)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [session, setSession] = useState<SessionRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveEmail, setSaveEmail] = useState('')
  const [savePw, setSavePw] = useState('')
  const [players, setPlayers] = useState<SP[]>([])
  const [games, setGames] = useState<Game[]>([])           // staged + in_progress
  const [partnered, setPartnered] = useState<Map<string, Set<string>>>(new Map())
  const [points, setPoints] = useState<Map<string, number>>(new Map())   // session points (Americano-style)
  const [lastRound, setLastRound] = useState<Map<number, CourtResult>>(new Map())   // King ladder: rank → result
  const [lastRoundCount, setLastRoundCount] = useState(0)
  const [nextRoundNo, setNextRoundNo] = useState(1)
  const [scoreGame, setScoreGame] = useState<Game | null>(null)          // score-entry dialog
  const [s1, setS1] = useState(''); const [s2, setS2] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [selectedBench, setSelectedBench] = useState<string | null>(null)   // tap-to-place
  const [subTarget, setSubTarget] = useState<{ gameId: string; outId: string } | null>(null)
  const [announce, setAnnounce] = useState(false)        // text-to-speech call-outs
  const [benchFilter, setBenchFilter] = useState('')     // bench name search

  // setup
  const [setupName, setSetupName] = useState('')
  const [courts, setCourts] = useState<Court[]>([])
  const [selectedCourts, setSelectedCourts] = useState<string[]>([])
  const [format, setFormat] = useState<'singles' | 'doubles'>('doubles')
  const [mode, setMode] = useState<'balanced' | 'americano' | 'mexicano' | 'king'>('balanced')
  const [rated, setRated] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [dayBookings, setDayBookings] = useState<{ court_id: string; starts_at: string; ends_at: string }[]>([])
  const [dayOpenPlay, setDayOpenPlay] = useState<{ id: string; court_ids: string[] | null; starts_at: string; ends_at: string | null }[]>([])

  // add player
  const [addOpen, setAddOpen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [guestName, setGuestName] = useState('')
  const [regulars, setRegulars] = useState<{ id: string; name: string; skill: number }[]>([])

  const { toast } = useToast()
  const supabase = createClient()

  async function fetchSessions(preferId?: string) {
    const nowIso = new Date().toISOString()
    let q = supabase.from('play_sessions').select('*')
      .is('ended_at', null).or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    if (solo) {
      const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null
      if (uid) setUserId(uid)
      q = q.is('league_id', null).eq('created_by', uid ?? '00000000-0000-0000-0000-000000000000')
    } else {
      q = q.eq('league_id', leagueId as string)
    }
    const { data } = await q.order('started_at', { ascending: false })
    const list = (data as SessionRow[]) ?? []
    setSessions(list)
    const pick = (preferId && list.find(s => s.id === preferId))
      || list.find(s => s.id === session?.id) || list[0] || null
    setSession(pick)
    if (solo && pick) setActiveHost({ manageCode: pick.manage_code, shareCode: pick.share_code, name: pick.name })
    if (pick) await loadState(pick.id)
    else { setPlayers([]); setGames([]) }
    setLoading(false)
  }

  async function loadState(sessionId: string) {
    const [{ data: sp }, { data: g }, { data: done }] = await Promise.all([
      supabase.from('session_players').select('*').eq('session_id', sessionId).order('queue_order'),
      supabase.from('session_games').select('*').eq('session_id', sessionId).in('status', ['staged', 'in_progress']),
      supabase.from('session_games').select('team1_ids, team2_ids, team1_score, team2_score, winner_team, rank, round_no, completed_at').eq('session_id', sessionId).eq('status', 'completed').order('completed_at'),
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

    // partner history (Auto Fill repeat-avoidance) + session points (standings)
    const pmap = new Map<string, Set<string>>()
    const pts = new Map<string, number>()
    const addPair = (a: string, b: string) => {
      if (!pmap.has(a)) pmap.set(a, new Set()); pmap.get(a)!.add(b)
      if (!pmap.has(b)) pmap.set(b, new Set()); pmap.get(b)!.add(a)
    }
    const addPts = (id: string, n: number) => pts.set(id, (pts.get(id) ?? 0) + n)
    type DoneGame = { team1_ids: string[]; team2_ids: string[]; team1_score: number | null; team2_score: number | null; winner_team: number | null; rank: number | null; round_no: number | null }
    const doneGames = (done ?? []) as DoneGame[]   // ordered by completed_at asc
    for (const game of doneGames) {
      for (const t of [game.team1_ids, game.team2_ids]) {
        for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) addPair(t[i], t[j])
      }
      game.team1_ids.forEach(id => addPts(id, game.team1_score ?? 0))
      game.team2_ids.forEach(id => addPts(id, game.team2_score ?? 0))
    }
    setPartnered(pmap)
    setPoints(pts)

    // King ladder: the most recently completed round, keyed by group rank.
    const liveRoundNos = ((g as Game[]) ?? []).map(x => x.round_no ?? 0)
    const doneRoundNos = doneGames.map(x => x.round_no ?? 0)
    const maxRound = Math.max(0, ...liveRoundNos, ...doneRoundNos)
    setNextRoundNo(maxRound + 1)
    const lr = new Map<number, CourtResult>()
    const lastDone = doneGames.filter(x => (x.round_no ?? 0) === maxRound && x.rank != null && x.winner_team != null)
    for (const game of lastDone) {
      lr.set(game.rank as number, game.winner_team === 1
        ? { winners: game.team1_ids, losers: game.team2_ids }
        : { winners: game.team2_ids, losers: game.team1_ids })
    }
    setLastRound(lr)
    setLastRoundCount(lr.size)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUserId(data.user?.id ?? null); setIsAnon(!!(data.user as any)?.is_anonymous) })
    fetchSessions()
    if (!solo) {
      supabase.from('courts').select('id, name').eq('league_id', leagueId as string).eq('active', true).order('created_at')
        .then(({ data }) => setCourts((data as Court[]) ?? []))
    }
  }, [leagueId])

  // Sessions opening/closing → refresh the list. Players/games changing → just
  // reload the current session's state (lighter than refetching every session).
  useRealtime(`openplay-s:${leagueId ?? 'solo'}`, [
    solo
      ? { table: 'play_sessions', ...(userId ? { filter: `created_by=eq.${userId}` } : {}) }
      : { table: 'play_sessions', filter: `league_id=eq.${leagueId}` },
  ], () => fetchSessions(), [leagueId, userId])
  useRealtime(`openplay-g:${leagueId ?? 'solo'}`, [
    { table: 'session_players' },
    { table: 'session_games' },
  ], () => { if (session) loadState(session.id) }, [leagueId])

  // 1s tick drives the court timers and wait timers.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const isScheduled = !!session && !!session.starts_at && new Date(session.starts_at).getTime() > Date.now()

  // Day-wide schedule for the create calendar: every court's confirmed bookings
  // + live Open Play sessions on the chosen date.
  useEffect(() => {
    if (!creating) return
    const day = startDate || new Date().toISOString().split('T')[0]
    const dayStart = new Date(`${day}T00:00`); const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
    supabase.from('court_bookings')
      .select('court_id, starts_at, ends_at')
      .eq('league_id', leagueId).eq('status', 'booked')
      .gte('starts_at', dayStart.toISOString()).lt('starts_at', dayEnd.toISOString())
      .order('starts_at')
      .then(({ data }) => setDayBookings((data as any[]) ?? []))
    supabase.from('play_sessions')
      .select('id, court_ids, starts_at, ends_at')
      .eq('league_id', leagueId).is('ended_at', null).not('court_ids', 'is', null)
      .gte('starts_at', dayStart.toISOString()).lt('starts_at', dayEnd.toISOString())
      .then(({ data }) => setDayOpenPlay((data as any[]) ?? []))
  }, [creating, startDate, leagueId])

  const courtName = (id: string) => courts.find(c => c.id === id)?.name ?? 'Court'
  const chosenDay = startDate || new Date().toISOString().split('T')[0]
  const existingBookings = dayBookings.filter(b => selectedCourts.includes(b.court_id))
  const chosenStart = startTime ? new Date(`${chosenDay}T${startTime}`) : null
  const chosenEnd = endTime ? new Date(`${chosenDay}T${endTime}`) : null
  const overlapping = (chosenStart && chosenEnd)
    ? existingBookings.filter(b => new Date(b.starts_at) < chosenEnd && new Date(b.ends_at) > chosenStart)
    : []

  // Read-only day calendar shown beside the create form
  const calHours = Array.from({ length: 16 }, (_, i) => i + 6) // 6am – 9pm
  const startH = startTime ? parseInt(startTime.split(':')[0], 10) : null
  const endH = endTime ? parseInt(endTime.split(':')[0], 10) : null
  const calBooked = (courtId: string, h: number) =>
    dayBookings.some(b => b.court_id === courtId && new Date(b.starts_at).getHours() <= h && new Date(b.ends_at).getHours() > h)
  const calOpenPlay = (courtId: string, h: number) =>
    dayOpenPlay.some(op => (op.court_ids ?? []).includes(courtId) && new Date(op.starts_at).getHours() <= h && (op.ends_at ? new Date(op.ends_at).getHours() > h : true))
  const calChosen = (courtId: string, h: number) =>
    selectedCourts.includes(courtId) && startH !== null && endH !== null && h >= startH && h < endH

  const playerMap = new Map(players.map(p => [p.id, p]))
  // Bench = available players, fairest first (fewest games, then longest wait).
  const bench = players.filter(p => p.status === 'queued')
    .sort((a, b) => a.games - b.games || new Date(a.queued_since).getTime() - new Date(b.queued_since).getTime())
  const resting = players.filter(p => p.status === 'resting')
  const liveGames = games.filter(g => g.status === 'in_progress').sort((a, b) => (a.court_number ?? 0) - (b.court_number ?? 0))
  const stagedGroups = games.filter(g => g.status === 'staged')
  const perGame = session?.format === 'doubles' ? 4 : 2
  const isFormat = session?.match_mode === 'americano' || session?.match_mode === 'mexicano' || session?.match_mode === 'king'
  const isKing = session?.match_mode === 'king'
  const occupiedCourts = new Set(liveGames.map(g => g.court_number))
  const freeCourts = session
    ? Array.from({ length: session.court_count }, (_, i) => i + 1).filter(c => !occupiedCourts.has(c))
    : []
  const playingCount = players.filter(p => p.status === 'playing').length

  const mmss = (fromIso: string) => {
    const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000))
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }
  const OVERTIME_MIN = 15

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
    const { data: newId, error } = await supabase.rpc('create_play_session', {
      p_league_id: leagueId, p_name: setupName.trim(), p_court_ids: selectedCourts,
      p_format: format, p_match_mode: mode, p_rated: rated,
      p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString(),
      p_allow_self_join: true,
    })
    if (error) toast({ title: 'Could not create', description: error.message, variant: 'destructive' })
    else {
      toast({ title: startsAt.getTime() > Date.now() ? 'Session scheduled 📅' : 'Session started 🎾' })
      setSetupName(''); setSelectedCourts([]); setStartDate(''); setStartTime(''); setEndTime(''); setMode('balanced')
      setCreating(false)
      await fetchSessions(newId as string)
    }
    setBusy(false)
  }

  async function openAdd() {
    setAddOpen(true)
    if (solo) return   // standalone sessions have no league members/regulars
    const [{ data: mem }, { data: reg }] = await Promise.all([
      supabase.from('league_members').select('user_id, profiles(display_name, avatar_color, avatar_url)')
        .eq('league_id', leagueId).eq('status', 'active'),
      supabase.from('open_play_regulars').select('id, name, skill').eq('league_id', leagueId).order('name'),
    ])
    setMembers((mem as unknown as Member[]) ?? [])
    setRegulars((reg as any[]) ?? [])
  }

  // Optimistic insert so the bench updates instantly; realtime reconciles after.
  function pushPlayer(id: string, name: string, color: string, avatarUrl: string | null, userId: string | null, skill = 1000) {
    setPlayers(prev => prev.some(p => p.id === id) ? prev : [...prev, {
      id, user_id: userId, display_name: name, avatar_color: color, avatar_url: avatarUrl,
      skill, status: 'queued', queue_order: 0, queued_since: new Date().toISOString(), wins: 0, losses: 0, games: 0,
    }])
  }

  async function addRegularToSession(name: string, skill: number) {
    const { data: id, error } = await supabase.rpc('add_session_player', { p_session_id: session!.id, p_user_id: null, p_guest_name: name, p_skill: skill })
    if (error) toast({ title: 'Could not add', description: error.message, variant: 'destructive' })
    else if (id) pushPlayer(id as string, name, '#64748b', null, null, skill)
  }

  async function addAllMembers() {
    const toAdd = members.filter(m => !players.some(p => p.user_id === m.user_id && p.status !== 'left'))
    if (toAdd.length === 0) return
    setBusy(true)
    for (const m of toAdd) {
      const { data: id } = await supabase.rpc('add_session_player', { p_session_id: session!.id, p_user_id: m.user_id, p_guest_name: null, p_skill: null })
      if (id) pushPlayer(id as string, m.profiles.display_name, m.profiles.avatar_color, m.profiles.avatar_url, m.user_id)
    }
    setBusy(false)
    toast({ title: `Added ${toAdd.length} member${toAdd.length > 1 ? 's' : ''}` })
  }
  async function addAllRegulars() {
    const toAdd = regulars.filter(r => !players.some(p => !p.user_id && p.display_name.toLowerCase() === r.name.toLowerCase() && p.status !== 'left'))
    if (toAdd.length === 0) return
    setBusy(true)
    for (const r of toAdd) {
      const { data: id } = await supabase.rpc('add_session_player', { p_session_id: session!.id, p_user_id: null, p_guest_name: r.name, p_skill: r.skill })
      if (id) pushPlayer(id as string, r.name, '#64748b', null, null, r.skill)
    }
    setBusy(false)
    toast({ title: `Added ${toAdd.length} regular${toAdd.length > 1 ? 's' : ''}` })
  }
  async function saveRegular() {
    const n = guestName.trim()
    if (!n) return
    const { error } = await supabase.from('open_play_regulars').insert({ league_id: leagueId, name: n })
    if (error) { toast({ title: error.code === '23505' ? 'Already saved' : 'Could not save', description: error.code === '23505' ? undefined : error.message, variant: 'destructive' }); return }
    toast({ title: `Saved ${n} as a regular` })
    const { data } = await supabase.from('open_play_regulars').select('id, name, skill').eq('league_id', leagueId).order('name')
    setRegulars((data as any[]) ?? [])
  }
  async function removeRegular(id: string) {
    await supabase.from('open_play_regulars').delete().eq('id', id)
    setRegulars(prev => prev.filter(r => r.id !== id))
  }

  async function addMember(userId: string) {
    const m = members.find(x => x.user_id === userId)
    const { data: id, error } = await supabase.rpc('add_session_player', {
      p_session_id: session!.id, p_user_id: userId, p_guest_name: null, p_skill: null,
    })
    if (error) toast({ title: 'Could not add', description: error.message, variant: 'destructive' })
    else if (id && m) pushPlayer(id as string, m.profiles.display_name, m.profiles.avatar_color, m.profiles.avatar_url, userId)
  }

  async function addGuest() {
    const name = guestName.trim()
    if (!name) return
    setGuestName('')
    const { data: id, error } = await supabase.rpc('add_session_player', {
      p_session_id: session!.id, p_user_id: null, p_guest_name: name, p_skill: null,
    })
    if (error) { toast({ title: 'Could not add guest', description: error.message, variant: 'destructive' }); setGuestName(name) }
    else if (id) pushPlayer(id as string, name, '#64748b', null, null)
  }

  async function rpc(fn: string, args: Record<string, unknown>, successReload = true) {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    if (error) toast({ title: 'Something went wrong', description: error.message, variant: 'destructive' })
    else if (successReload && session) await loadState(session.id)
    setBusy(false)
    return !error
  }

  // Auto Fill builds balanced on-deck groups. It stages up to one group per
  // court (so when every court is busy you still line up the next round and can
  // see who's next), capped by how many full groups the bench can fill.
  async function autoFill() {
    if (!session) return
    const maxGroups = Math.max(0, session.court_count - stagedGroups.length)
    if (maxGroups <= 0) { toast({ title: 'On Deck is full', description: 'Send a group to a court to free up an On Deck slot.' }); return }
    const roster: RosterPlayer[] = bench.map(p => ({ id: p.id, skill: p.skill, games: p.games, waitMs: now - new Date(p.queued_since).getTime() }))
    const groups = buildFairGroups(roster, session.format, maxGroups, partnered)
    if (groups.length === 0) { toast({ title: `Need ${perGame} on the bench`, variant: 'destructive' }); return }
    setBusy(true)
    for (const grp of groups) {
      const { error } = await supabase.rpc('stage_session_group', { p_session_id: session.id, p_team1: grp.team1, p_team2: grp.team2 })
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); break }
    }
    await loadState(session.id)
    setBusy(false)
  }

  const addEmptyGroup = () => session && rpc('stage_session_group', { p_session_id: session.id, p_team1: [], p_team2: [] })

  // Pair the whole bench into balanced On Deck groups (Drop-in convenience).
  async function pairAll() {
    if (!session) return
    const n = Math.floor(bench.length / perGame)
    if (n === 0) { toast({ title: `Need ${perGame} on the bench`, variant: 'destructive' }); return }
    const roster: RosterPlayer[] = bench.map(p => ({ id: p.id, skill: p.skill, games: p.games, waitMs: now - new Date(p.queued_since).getTime() }))
    const groups = buildFairGroups(roster, session.format, n, partnered)
    setBusy(true)
    for (const grp of groups) {
      const { error } = await supabase.rpc('stage_session_group', { p_session_id: session.id, p_team1: grp.team1, p_team2: grp.team2 })
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); break }
    }
    await loadState(session.id)
    setBusy(false)
  }

  // King / Americano / Mexicano: build a full round of ranked groups (players ÷
  // per-game), independent of court count. They stage in On Deck; `start` also
  // sends as many as the free courts allow.
  async function generateRound(start: boolean) {
    if (!session) return
    if (liveGames.length > 0 || stagedGroups.length > 0) { toast({ title: 'Finish the current round first', description: 'Score every game (and clear On Deck) before generating the next round.' }); return }
    const ready = bench
    const availableIds = new Set(ready.map(p => p.id))
    const groupCount = Math.floor(ready.length / perGame)
    if (groupCount === 0) { toast({ title: `Need ${perGame} ready players`, variant: 'destructive' }); return }
    const seedBalanced = (n: number) => {
      const roster: RosterPlayer[] = ready.map(p => ({ id: p.id, skill: p.skill, games: p.games, waitMs: now - new Date(p.queued_since).getTime() }))
      return buildFairGroups(roster, session.format, n, partnered)
    }
    let groups
    if (session.match_mode === 'mexicano') {
      const ranked = [...ready].sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0) || b.wins - a.wins)
      groups = buildMexicanoRound(ranked, session.format, groupCount)
    } else if (session.match_mode === 'king') {
      groups = buildKingRound(lastRound, lastRoundCount || groupCount, partnered)
      if (groups.length === 0 || groups.some(g => [...g.team1, ...g.team2].some(id => !availableIds.has(id)))) {
        groups = seedBalanced(groupCount)   // first round, or roster changed
      }
    } else {
      groups = seedBalanced(groupCount)   // americano: rotate partners
    }
    if (groups.length === 0) { toast({ title: `Need ${perGame} ready players`, variant: 'destructive' }); return }

    setBusy(true)
    const stagedIds: string[] = []
    for (let i = 0; i < groups.length; i++) {
      const { data: gid, error } = await supabase.rpc('stage_session_group', {
        p_session_id: session.id, p_team1: groups[i].team1, p_team2: groups[i].team2, p_rank: i + 1, p_round: nextRoundNo,
      })
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); break }
      if (gid) stagedIds.push(gid as string)
    }
    if (start) {
      const courts = [...freeCourts]
      for (let i = 0; i < stagedIds.length && i < courts.length; i++) {
        await supabase.rpc('assign_session_group', { p_game_id: stagedIds[i], p_court: courts[i] })
      }
    }
    await loadState(session.id)
    setBusy(false)
  }

  // Send all staged groups to free courts, in rank order.
  async function startRound() {
    if (!session) return
    const sorted = [...stagedGroups].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    const courts = [...freeCourts]
    if (courts.length === 0) { toast({ title: 'No free courts', variant: 'destructive' }); return }
    setBusy(true)
    for (let i = 0; i < sorted.length && i < courts.length; i++) {
      const g = sorted[i]
      const t1 = g.team1_ids.map(nameOf).join(' and '); const t2 = g.team2_ids.map(nameOf).join(' and ')
      const { error } = await supabase.rpc('assign_session_group', { p_game_id: g.id, p_court: courts[i] })
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); break }
      speak(`Court ${courts[i]}. ${t1}, versus ${t2}`)
    }
    await loadState(session.id)
    setBusy(false)
  }

  // Tap a bench player, then tap an empty slot to place them.
  function teamsWith(g: Game, addId: string): [string[], string[]] {
    const cap = perGame / 2
    const t1 = [...g.team1_ids], t2 = [...g.team2_ids]
    if (t1.length < cap) t1.push(addId); else t2.push(addId)
    return [t1, t2]
  }
  async function placeInGroup(g: Game) {
    if (!selectedBench || (g.team1_ids.length + g.team2_ids.length) >= perGame) return
    const [t1, t2] = teamsWith(g, selectedBench)
    setSelectedBench(null)
    await rpc('set_session_group', { p_game_id: g.id, p_team1: t1, p_team2: t2 })
  }
  function removeFromGroup(g: Game, pid: string) {
    rpc('set_session_group', { p_game_id: g.id, p_team1: g.team1_ids.filter(x => x !== pid), p_team2: g.team2_ids.filter(x => x !== pid) })
  }
  const toggleLock = (g: Game) => rpc('lock_session_group', { p_game_id: g.id, p_locked: !g.locked })
  const disband = (g: Game) => rpc('disband_session_group', { p_game_id: g.id })

  function speak(text: string) {
    if (!announce || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }
  async function sendToCourt(g: Game, court: number) {
    const t1 = g.team1_ids.map(nameOf).join(' and ')
    const t2 = g.team2_ids.map(nameOf).join(' and ')
    const ok = await rpc('assign_session_group', { p_game_id: g.id, p_court: court })
    if (ok) speak(`Court ${court}. ${t1}, versus ${t2}`)
  }

  // Substitute: tap Sub on a player, then tap a bench player to swap in.
  async function benchTap(pid: string) {
    if (subTarget) {
      const ok = await rpc('sub_session_player', { p_game_id: subTarget.gameId, p_out: subTarget.outId, p_in: pid })
      if (ok) setSubTarget(null)
      return
    }
    setSelectedBench(prev => prev === pid ? null : pid)
  }

  function openScore(game: Game) { setScoreGame(game); setS1(''); setS2('') }
  async function submitScore() {
    if (!scoreGame) return
    const t1 = parseInt(s1, 10), t2 = parseInt(s2, 10)
    if (isNaN(t1) || isNaN(t2) || t1 < 0 || t2 < 0) { toast({ title: 'Enter both scores', variant: 'destructive' }); return }
    if (t1 === t2) { toast({ title: 'Scores can’t be tied', variant: 'destructive' }); return }
    const ok = await rpc('complete_session_game', { p_game_id: scoreGame.id, p_t1: t1, p_t2: t2 })
    if (ok) setScoreGame(null)
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
    else { toast({ title: 'Session ended' }); if (solo) clearActiveHost(); setSession(null); fetchSessions() }
  }

  // C — keep the session permanently. Either convert the anonymous account into
  // a new one, or — if the email already has an account — sign into it and move
  // this session there.
  async function saveAccount() {
    const email = saveEmail.trim()
    if (!email || savePw.length < 6) { toast({ title: 'Enter an email and a password (6+ chars)', variant: 'destructive' }); return }
    if (!session) return
    const manageCode = session.manage_code
    setBusy(true)

    // 1) try converting the current (anonymous) account to this new email
    const { error: updErr } = await supabase.auth.updateUser({ email, password: savePw })
    if (!updErr) {
      setBusy(false); setSaveOpen(false); setIsAnon(false)
      toast({ title: 'Saved! 🎉', description: 'Sign in with that email on any device to pick up where you left off.' })
      return
    }

    // 2) email already has an account → sign into it and move this session in
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: savePw })
    if (signErr) {
      setBusy(false)
      toast({ title: 'Could not save', description: 'That email already has an account — enter its correct password to save into it, or use a different email.', variant: 'destructive' })
      return
    }
    const { error: adoptErr } = await supabase.rpc('adopt_solo_session', { p_manage_code: manageCode })
    setBusy(false)
    if (adoptErr) { toast({ title: 'Signed in, but couldn’t move the session', description: adoptErr.message, variant: 'destructive' }); return }
    setSaveOpen(false); setIsAnon(false)
    toast({ title: 'Saved to your account 🎉', description: 'Signed in — this session is now in your account.' })
    await fetchSessions()
  }

  function copyShare() {
    if (!session) return
    navigator.clipboard.writeText(`${window.location.origin}/play/${session.share_code}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    toast({ title: 'Player link copied!', description: 'Players can follow the queue on their phones — no login needed.' })
  }

  const nameOf = (id: string) => playerMap.get(id)?.display_name ?? '?'

  if (loading) return <div className="text-center py-12 text-gray-500">Loading…</div>

  // ── History ─────────────────────────────────────────────────────────────────
  if (showHistory) return <LeagueOpenPlayHistory leagueId={leagueId} createdBy={solo ? userId : null} onBack={() => setShowHistory(false)} />

  // ── No selected session: empty state ────────────────────────────────────────
  if (!session && !creating) {
    if (solo) {
      return (
        <div className="text-center py-16">
          <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400 mb-4">No active session.</p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" asChild><Link href="/play/new"><Plus className="w-4 h-4 mr-1" />Start a session</Link></Button>
            <Button size="sm" variant="outline" onClick={() => setShowHistory(true)}><History className="w-4 h-4 mr-1" />History</Button>
          </div>
        </div>
      )
    }
    if (!isOrganizer) {
      return (
        <div className="text-center py-16 text-gray-400">
          <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm mb-4">No Open Play session running right now.</p>
          <button onClick={() => setShowHistory(true)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-600">
            <History className="w-3.5 h-3.5" />View past sessions
          </button>
        </div>
      )
    }
    return (
      <div className="text-center py-16">
        <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400 mb-4">No Open Play sessions scheduled or running.</p>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" onClick={() => setCreating(true)} disabled={courts.length === 0}>
            <Plus className="w-4 h-4 mr-1" />New session
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowHistory(true)}>
            <History className="w-4 h-4 mr-1" />History
          </Button>
        </div>
        {courts.length === 0 && (
          <p className="text-xs text-amber-600 mt-3">Add a court first on the <strong>Courts</strong> tab.</p>
        )}
      </div>
    )
  }

  // ── Create a session ────────────────────────────────────────────────────────
  if (creating) {
    return (
      <div>
        <button onClick={() => setCreating(false)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Sessions
        </button>
        <h2 className="font-semibold text-gray-900 mb-1">New Open Play session</h2>
        <p className="text-xs text-gray-400 mb-4">
          Check players in, auto-balance courts, and rotate the queue.{' '}
          <Link href="/open-play-guide" className="underline hover:text-green-600">How it works</Link>
        </p>
        {courts.length === 0 ? (
          <div className="border rounded-xl p-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
            Add a court first (on the <strong>Courts</strong> tab) — Open Play runs on your courts and blocks them from booking during the session.
          </div>
        ) : (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
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

          {overlapping.length > 0 && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              Your selected window clashes with a confirmed booking (shown in red on the calendar). Move the open-play time, pick another court, or cancel the booking first.
            </p>
          )}

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

          <div className="space-y-1.5">
            <Label>Play style</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { k: 'balanced', label: 'Drop-in', desc: 'Queue + courts' },
                { k: 'king', label: 'King of the Court', desc: 'Winners up, losers down' },
                { k: 'americano', label: 'Americano', desc: 'Rotate partners' },
                { k: 'mexicano', label: 'Mexicano', desc: 'Pair by standings' },
              ] as const).map(m => (
                <button key={m.k} type="button" onClick={() => setMode(m.k)}
                  className={`text-left px-3 py-2 rounded-lg border ${mode === m.k ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'}`}>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-[10px] text-gray-400">{m.desc}</span>
                </button>
              ))}
            </div>
            {mode !== 'balanced' && (
              <p className="text-[11px] text-gray-400">
                {mode === 'americano'
                  ? 'Everyone rotates partners each round; ranked by total points. Enter each game’s score to advance.'
                  : mode === 'mexicano'
                    ? 'Pairs the closest-ranked players each round (1&4 vs 2&3); ranked by points.'
                    : 'Each round, winners move up a court and losers move down — Court 1 is the “Kings” court. Partners are re-shuffled each round. Enter every court’s score to advance.'}
              </p>
            )}
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={rated} onChange={e => setRated(e.target.checked)} className="mt-0.5" />
            <span className="text-sm text-gray-700">
              <span className="font-medium">Rated session</span>
              <span className="block text-xs text-gray-400">Games between league members count toward ELO. Guest games are always casual.</span>
            </span>
          </label>
          <Button onClick={startSession} disabled={busy || overlapping.length > 0} className="w-full">
            <Play className="w-4 h-4 mr-1" />{busy ? 'Saving…' : 'Create session'}
          </Button>
        </div>

        {/* RIGHT: read-only day calendar of bookings + open play */}
        <div className="border rounded-xl p-4 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">
              {new Date(`${chosenDay}T00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-[10px] text-gray-400 font-medium text-left pr-2 pb-1 w-14"></th>
                  {calHours.map(h => (
                    <th key={h} className="text-[9px] text-gray-400 font-normal pb-1">{((h + 11) % 12) + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courts.map(c => (
                  <tr key={c.id}>
                    <td className="text-[11px] text-gray-600 font-medium pr-2 truncate max-w-[56px]">{c.name}</td>
                    {calHours.map(h => {
                      const booked = calBooked(c.id, h)
                      const op = calOpenPlay(c.id, h)
                      const chosen = calChosen(c.id, h)
                      const clash = chosen && booked
                      let cls = 'bg-gray-50'
                      if (op) cls = 'bg-blue-400'
                      else if (booked) cls = 'bg-green-500'
                      if (chosen) cls = clash ? 'bg-red-500' : 'bg-gray-900'
                      return <td key={h} className={`h-6 border border-white ${cls}`} title={`${c.name} ${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}${booked ? ' · booked' : op ? ' · open play' : ''}`} />
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-3 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />Booked</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" />Open Play</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-900 inline-block" />Your session</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Clash</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Pick courts and a time on the left — your session shows here so you can avoid clashes.</p>
        </div>
        </div>
        )}
      </div>
    )
  }

  // ── Active session (organizer console) ──────────────────────────────────────
  if (!session) return null
  return (
    <div>
      {/* Session switcher — multiple sessions can run at once */}
      {(sessions.length > 1 || isOrganizer) && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {sessions.map(s => {
            const active = s.id === session.id
            const sched = !!s.starts_at && new Date(s.starts_at).getTime() > Date.now()
            return (
              <button key={s.id} onClick={() => { setSession(s); loadState(s.id) }}
                className={`text-xs px-2.5 py-1 rounded-full border ${active ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {s.name}{sched && ' · 📅'}
              </button>
            )
          })}
          {isOrganizer && !solo && (
            <button onClick={() => setCreating(true)}
              className="text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 flex items-center gap-1">
              <Plus className="w-3 h-3" />New session
            </button>
          )}
        </div>
      )}

      {solo && isAnon && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-green-800">Save this session so you never lose it — and pick up on any device.</p>
          <Button size="sm" onClick={() => setSaveOpen(true)}>Save my session</Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            {session.name}
            {session.rated && <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">RATED</span>}
            {isScheduled && <span className="text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">SCHEDULED</span>}
            {isFormat && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 rounded-full px-2 py-0.5 uppercase">{session.match_mode}</span>}
          </h2>
          <p className="text-xs text-gray-400 capitalize">
            {session.format} · {session.court_count} courts
            {session.starts_at && session.ends_at && (
              <span className="normal-case"> · {new Date(session.starts_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}–{new Date(session.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowHistory(true)}><History className="w-3.5 h-3.5 mr-1" />History</Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/play/${session.share_code}/board`} target="_blank" rel="noopener noreferrer"><Monitor className="w-3.5 h-3.5 mr-1" />Board</a>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}><QrCode className="w-3.5 h-3.5 mr-1" />QR</Button>
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

      {/* ── Scoreboard console (softened dark) ──────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl p-4 sm:p-5 mb-2 shadow-sm">
        {/* Player totals */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: 'Checked in', val: players.filter(p => p.status !== 'left').length, accent: 'border-sky-500', color: 'text-white' },
            { label: 'Ready', val: bench.length, accent: 'border-green-500', color: 'text-green-400' },
            { label: 'Playing', val: playingCount, accent: 'border-violet-500', color: 'text-white' },
            { label: 'Resting', val: resting.length, accent: 'border-amber-500', color: 'text-white' },
          ].map(s => (
            <div key={s.label} className={`bg-slate-800 rounded-xl px-3 py-2 border-t-2 ${s.accent}`}>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{s.label}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Courts */}
        <div className="text-[11px] uppercase tracking-[0.18em] text-green-400 font-bold mb-2.5">Courts</div>
        <div className="grid sm:grid-cols-2 gap-2.5 mb-6">
          {Array.from({ length: session.court_count }, (_, i) => i + 1).map(courtNo => {
            const game = liveGames.find(g => g.court_number === courtNo)
            const over = game ? (now - new Date(game.started_at).getTime()) / 60000 > OVERTIME_MIN : false
            return (
              <div key={courtNo} className={`bg-slate-800 border border-slate-700/60 rounded-xl p-3 border-l-[3px] ${over ? 'border-l-red-500' : game ? 'border-l-green-500' : 'border-l-slate-600'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-bold italic text-sm">
                    COURT {courtNo}
                    {isKing && courtNo === 1 && <span className="ml-1.5 text-[9px] not-italic font-bold text-amber-300 bg-amber-500/20 rounded px-1.5 py-0.5 align-middle">KINGS</span>}
                    {isKing && courtNo === session.court_count && session.court_count > 1 && <span className="ml-1.5 text-[9px] not-italic font-medium text-slate-400 align-middle">bottom</span>}
                  </span>
                  {game ? (
                    over
                      ? <span className="text-[9px] uppercase tracking-wide font-bold text-white bg-red-500 rounded px-1.5 py-0.5">Overtime {mmss(game.started_at)}</span>
                      : <span className="text-[11px] text-green-400 font-medium tabular-nums">{mmss(game.started_at)}</span>
                  ) : <span className="text-[10px] uppercase tracking-wide text-slate-600">Open</span>}
                </div>
                {game ? (
                  <div className="space-y-1.5">
                    {([1, 2] as const).map(team => {
                      const ids = team === 1 ? game.team1_ids : game.team2_ids
                      return (
                        <div key={team} className="flex items-center gap-1.5 flex-wrap">
                          {ids.map(id => (
                            <span key={id} className="inline-flex items-center gap-1 text-[13px] text-slate-100">
                              {nameOf(id)}
                              {isOrganizer && (
                                <button onClick={() => { setSubTarget({ gameId: game.id, outId: id }); toast({ title: 'Pick a bench player to sub in' }) }}
                                  className="text-slate-500 hover:text-green-400" title="Substitute"><Repeat className="w-3 h-3" /></button>
                              )}
                            </span>
                          ))}
                          {team === 1 && <span className="text-[10px] font-bold text-slate-600">vs</span>}
                        </div>
                      )
                    })}
                    {isOrganizer && (
                      <button onClick={() => openScore(game)} disabled={busy}
                        className="mt-1.5 w-full text-[11px] uppercase tracking-wide font-bold text-white bg-green-600 hover:bg-green-500 rounded-lg py-1.5">
                        Enter score
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-600 py-3 text-center">Send a group from On Deck</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Standings */}
        {(() => {
          const standings = players.filter(p => p.status !== 'left')
            .map(p => ({ ...p, pts: points.get(p.id) ?? 0 }))
            .filter(p => p.games > 0)
            .sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.losses - b.losses)
          if (standings.length === 0) return null
          return (
            <div className="mb-6">
              <div className="text-[11px] uppercase tracking-[0.18em] text-green-400 font-bold mb-2.5">Standings</div>
              <div className="border border-slate-700/60 rounded-xl overflow-hidden">
                {standings.map((p, i) => (
                  <div key={p.id} className={`flex items-center gap-2.5 px-3 py-2 text-sm ${i > 0 ? 'border-t border-slate-700/60' : ''} ${p.status === 'playing' ? 'bg-green-500/10' : 'bg-slate-800'}`}>
                    <span className="w-5 text-center text-xs font-bold text-slate-500">{i + 1}</span>
                    <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url ?? null} size="xs" />
                    <span className="flex-1 truncate text-slate-100">{p.display_name}</span>
                    <span className="text-xs text-slate-500">{p.wins}–{p.losses}</span>
                    <span className="text-sm font-bold text-white tabular-nums w-10 text-right">{p.pts}<span className="text-[10px] font-normal text-slate-500 ml-0.5">pts</span></span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* On Deck — staging for every play style (editable) */}
        {isOrganizer && (
          <>
            <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-[0.18em] text-green-400 font-bold">On Deck</span>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setAnnounce(a => !a)}
                  className={`rounded-lg px-2 py-1.5 flex items-center ${announce ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                  title={announce ? 'Voice call-outs on' : 'Voice call-outs off'}>
                  {announce ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
                {isFormat ? (
                  stagedGroups.length > 0 ? (
                    <button onClick={startRound} disabled={busy || freeCourts.length === 0}
                      className="text-[10px] uppercase tracking-wide font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                      <Play className="w-3 h-3" />Start round
                    </button>
                  ) : (
                    <>
                      <button onClick={() => generateRound(true)} disabled={busy || liveGames.length > 0}
                        className="text-[10px] uppercase tracking-wide font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                        <Play className="w-3 h-3" />Generate &amp; start
                      </button>
                      <button onClick={() => generateRound(false)} disabled={busy || liveGames.length > 0}
                        className="text-[10px] uppercase tracking-wide font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                        <Wand2 className="w-3 h-3" />To On Deck
                      </button>
                    </>
                  )
                ) : (
                  <>
                    <button onClick={autoFill} disabled={busy}
                      className="text-[10px] uppercase tracking-wide font-bold text-white bg-green-600 hover:bg-green-500 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                      <Wand2 className="w-3 h-3" />Auto fill
                    </button>
                    <button onClick={pairAll} disabled={busy}
                      className="text-[10px] uppercase tracking-wide font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                      <Wand2 className="w-3 h-3" />Pair all
                    </button>
                    <button onClick={addEmptyGroup} disabled={busy}
                      className="text-[10px] uppercase tracking-wide font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                      <Plus className="w-3 h-3" />Group
                    </button>
                  </>
                )}
              </div>
            </div>
            {selectedBench && (
              <p className="text-[11px] text-green-300 mb-2">Tap an empty slot to place <strong>{nameOf(selectedBench)}</strong> · <button onClick={() => setSelectedBench(null)} className="underline">cancel</button></p>
            )}
            {stagedGroups.length === 0 ? (
              <p className="text-[12px] text-slate-500 mb-6">
                {isFormat
                  ? <>No round staged. Hit <strong className="text-slate-300">Generate</strong> — it builds this round&apos;s games from everyone on the bench and queues them onto your courts (works on a single court too).</>
                  : <>No groups staged. Hit <strong className="text-slate-300">Auto fill</strong> (fills free courts) or <strong className="text-slate-300">Pair all</strong> (pairs the whole bench), then tweak before sending.</>}
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5 mb-6">
                {[...stagedGroups].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map((g, gi) => {
                  const ids = [...g.team1_ids, ...g.team2_ids]
                  const full = ids.length >= perGame
                  const label = isKing && g.rank != null ? `Rank ${g.rank}` : isFormat && g.rank != null ? `Game ${g.rank}` : `Group ${gi + 1}`
                  return (
                    <div key={g.id} className="bg-slate-800 border border-slate-700/60 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] text-slate-400 font-medium">
                          {label}
                          {isKing && g.rank === 1 && <span className="ml-1.5 text-[9px] font-bold text-amber-300 bg-amber-500/20 rounded px-1.5 py-0.5">KINGS</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleLock(g)} className={g.locked ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'} title={g.locked ? 'Unlock' : 'Lock'}>
                            {g.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => disband(g)} className="text-slate-500 hover:text-red-400" title="Disband"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {ids.map(id => (
                          <button key={id} onClick={() => removeFromGroup(g, id)}
                            className="inline-flex items-center gap-1 text-[12px] text-slate-100 bg-slate-700 rounded px-2 py-1 hover:bg-red-500/20">
                            {nameOf(id)}<X className="w-2.5 h-2.5 text-slate-400" />
                          </button>
                        ))}
                        {Array.from({ length: perGame - ids.length }).map((_, k) => (
                          <button key={k} onClick={() => placeInGroup(g)} disabled={!selectedBench}
                            className={`text-[12px] rounded px-3 py-1 border border-dashed ${selectedBench ? 'border-green-500 text-green-400 hover:bg-green-500/10' : 'border-slate-600 text-slate-600'}`}>+</button>
                        ))}
                      </div>
                      {full && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">Send to</span>
                          {freeCourts.length === 0
                            ? <span className="text-[10px] text-slate-500">waiting for a court</span>
                            : freeCourts.map(c => (
                              <button key={c} onClick={() => sendToCourt(g, c)} disabled={busy}
                                className="text-[10px] uppercase font-bold text-white bg-green-600 hover:bg-green-500 rounded px-2 py-1">Court {c}</button>
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Bench & roster */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] uppercase tracking-[0.18em] text-green-400 font-bold">Bench {bench.length > 0 && <span className="text-slate-500">· {bench.length}</span>}</span>
          {isOrganizer && (
            <button onClick={openAdd} className="text-[10px] uppercase tracking-wide font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
              <UserPlus className="w-3 h-3" />Add player
            </button>
          )}
        </div>
        {subTarget && (
          <p className="text-[11px] text-green-300 mb-2">Tap a bench player to swap in for <strong>{nameOf(subTarget.outId)}</strong> · <button onClick={() => setSubTarget(null)} className="underline">cancel</button></p>
        )}
        {bench.length > 6 && (
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={benchFilter} onChange={e => setBenchFilter(e.target.value)} placeholder="Search bench…"
              className="w-full bg-slate-800 text-slate-100 placeholder-slate-500 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-green-500" />
          </div>
        )}
        <div className="space-y-1.5">
          {bench.filter(p => p.display_name.toLowerCase().includes(benchFilter.toLowerCase())).map(p => {
            const sel = selectedBench === p.id
            return (
              <div key={p.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${sel ? 'bg-green-500/15 ring-1 ring-green-500' : 'bg-slate-800'}`}>
                <button onClick={() => isOrganizer && benchTap(p.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left" disabled={!isOrganizer}>
                  <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url ?? null} size="xs" />
                  <span className="text-sm text-slate-100 truncate">
                    {p.display_name}
                    {!p.user_id && <span className="text-[10px] text-slate-500 ml-1">guest</span>}
                  </span>
                </button>
                <span className="text-[11px] text-slate-500 tabular-nums shrink-0">waited {mmss(p.queued_since)} · {p.games}g</span>
                {isOrganizer && (
                  <>
                    <button onClick={() => setStatus(p.id, 'resting')} className="text-slate-500 hover:text-amber-400 shrink-0" title="Rest"><Pause className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setStatus(p.id, 'left')} className="text-slate-500 hover:text-red-400 shrink-0" title="Remove"><X className="w-3.5 h-3.5" /></button>
                  </>
                )}
              </div>
            )
          })}
          {bench.length === 0 && <p className="text-[12px] text-slate-500 py-3 text-center">Bench is empty — add players to get going.</p>}
        </div>

        {/* Resting */}
        {resting.length > 0 && (
          <div className="mt-4">
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-bold">Resting · {resting.length}</span>
            <div className="space-y-1.5 mt-2">
              {resting.map(p => (
                <div key={p.id} className="flex items-center gap-2.5 bg-slate-800/60 rounded-lg px-3 py-2">
                  <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url ?? null} size="xs" />
                  <span className="text-sm text-slate-300 flex-1 truncate">{p.display_name}</span>
                  {isOrganizer && <button onClick={() => setStatus(p.id, 'queued')} className="text-[11px] text-green-400 hover:underline">Back in</button>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Score entry dialog */}
      <Dialog open={!!scoreGame} onOpenChange={o => !o && setScoreGame(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Enter the score</DialogTitle></DialogHeader>
          {scoreGame && (
            <div className="space-y-2">
              {([1, 2] as const).map(team => {
                const ids = team === 1 ? scoreGame.team1_ids : scoreGame.team2_ids
                return (
                  <div key={team} className="flex items-center gap-3 rounded-xl border bg-white p-3">
                    <span className="flex-1 text-sm font-medium text-gray-800 leading-snug">{ids.map(nameOf).join(' & ')}</span>
                    <input
                      type="number" inputMode="numeric" min={0} placeholder="0"
                      value={team === 1 ? s1 : s2}
                      onChange={e => (team === 1 ? setS1 : setS2)(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitScore() }}
                      autoFocus={team === 1}
                      className="w-16 h-12 shrink-0 text-center text-2xl font-bold text-gray-900 border rounded-lg outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )
              })}
              <p className="text-[11px] text-gray-400 text-center pt-1">The higher score wins. Ties aren’t allowed.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoreGame(null)}>Cancel</Button>
            <Button onClick={submitScore} disabled={busy}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR check-in dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Scan to check in</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500 -mt-1 mb-1 text-center">Players scan this, type their name, and join the queue — no account or app needed.</p>
          {session && <OpenPlayQR shareCode={session.share_code} />}
          <DialogFooter>
            <Button variant="outline" onClick={copyShare} className="w-full">
              <Link2 className="w-4 h-4 mr-1" />Copy link instead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save session (anonymous → account) dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Save your session</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500 -mt-1">Add an email &amp; password so you can sign in on any device and never lose this session.</p>
          <div className="space-y-2 mt-1">
            <Input type="email" placeholder="Email" value={saveEmail} onChange={e => setSaveEmail(e.target.value)} />
            <Input type="password" placeholder="Password (6+ characters)" value={savePw} onChange={e => setSavePw(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveAccount() }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Not now</Button>
            <Button onClick={saveAccount} disabled={busy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Button variant="outline" size="icon" onClick={saveRegular} disabled={!guestName.trim()} title="Save as a regular">
                  <Star className="w-4 h-4" />
                </Button>
                <Button onClick={addGuest} disabled={!guestName.trim()}>Add</Button>
              </div>
              <p className="text-xs text-gray-400">Tap the star to save a frequent player for next time.</p>
            </div>

            {regulars.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Regulars</Label>
                  <button onClick={addAllRegulars} disabled={busy} className="text-xs font-medium text-green-700 hover:underline">Add all</button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {regulars.map(r => {
                    const inSession = players.some(p => !p.user_id && p.display_name.toLowerCase() === r.name.toLowerCase() && p.status !== 'left')
                    return (
                      <div key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200">
                        <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-sm flex-1 truncate">{r.name}</span>
                        <button onClick={() => removeRegular(r.id)} className="text-gray-300 hover:text-red-500" title="Forget"><X className="w-3.5 h-3.5" /></button>
                        <button onClick={() => addRegularToSession(r.name, r.skill)} disabled={inSession}
                          className={`text-xs font-medium rounded px-2 py-1 ${inSession ? 'text-gray-300' : 'text-green-700 bg-green-50 hover:bg-green-100'}`}>
                          {inSession ? 'In' : 'Add'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!solo && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>League members</Label>
                <button onClick={addAllMembers} disabled={busy} className="text-xs font-medium text-green-700 hover:underline">Add all</button>
              </div>
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
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
