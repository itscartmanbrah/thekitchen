'use client'

import { useEffect, useRef, useState } from 'react'
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
import { buildFairGroups, buildMexicanoRound, buildKingKeepTeams, buildSkillGroups, buildMixedGroups, courtForLevel, type RosterPlayer } from '@/lib/open-play'
import { LeagueOpenPlayHistory } from '@/components/leagues/league-open-play-history'
import { OpenPlayQR } from '@/components/open-play-qr'
import { LiveTimer } from '@/components/live-timer'
import { OpenPlaySkeleton } from '@/components/open-play-skeleton'
import { SessionRecap } from '@/components/session-recap'
import { StyleExplainer, StyleBadge } from '@/components/open-play-styles'
import { setActiveHost, clearActiveHost } from '@/lib/active-host'
import {
  Play, Plus, UserPlus, Link2, Check, Pause, X, Swords,
  ArrowLeft, CalendarDays, Wand2, Lock, Unlock, Repeat, Trash2, Monitor,
  Volume2, VolumeX, Star, Search, History, QrCode, MoreHorizontal, Power,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

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
  auto_stage: boolean
  partner_rotation: string
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
  skill_level?: number | null
  gender?: string | null
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
  const [recapId, setRecapId] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveEmail, setSaveEmail] = useState('')
  const [savePw, setSavePw] = useState('')
  const [players, setPlayers] = useState<SP[]>([])
  const [games, setGames] = useState<Game[]>([])           // staged + in_progress
  const [partnered, setPartnered] = useState<Map<string, Set<string>>>(new Map())
  const [lastPartner, setLastPartner] = useState<Map<string, string>>(new Map())
  const [points, setPoints] = useState<Map<string, number>>(new Map())   // session points (Americano-style)
  const [nextRoundNo, setNextRoundNo] = useState(1)
  const [scoreGame, setScoreGame] = useState<Game | null>(null)          // score-entry dialog
  const [s1, setS1] = useState(''); const [s2, setS2] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  // tap-to-place / tap-to-swap: a picked player is either on the bench or in a staged slot
  const [pick, setPick] = useState<{ kind: 'bench'; pid: string } | { kind: 'slot'; gameId: string; pid: string } | null>(null)
  const [subTarget, setSubTarget] = useState<{ gameId: string; outId: string } | null>(null)
  const [announce, setAnnounce] = useState(false)        // text-to-speech call-outs
  const [benchFilter, setBenchFilter] = useState('')     // bench name search

  // setup
  const [setupName, setSetupName] = useState('')
  const [courts, setCourts] = useState<Court[]>([])
  const [selectedCourts, setSelectedCourts] = useState<string[]>([])
  const [format, setFormat] = useState<'singles' | 'doubles'>('doubles')
  const [mode, setMode] = useState<'balanced' | 'americano' | 'mexicano' | 'king' | 'skill' | 'mixed' | 'skill_courts'>('balanced')
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
  const [guestLevel, setGuestLevel] = useState(3)             // skill mode: new guest's level
  const [guestGender, setGuestGender] = useState<'m' | 'f' | null>(null)   // mixed mode: new guest's gender
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
    // Render immediately; avatars load in the background (initials show first).
    const rows = (sp as SP[]) ?? []
    setPlayers(rows)
    setGames((g as Game[]) ?? [])

    const memberIds = rows.filter(r => r.user_id).map(r => r.user_id as string)
    if (memberIds.length) {
      supabase.from('profiles').select('id, avatar_url').in('id', memberIds).then(({ data: profs }) => {
        const map = new Map(((profs ?? []) as any[]).map(p => [p.id, p.avatar_url]))
        setPlayers(prev => prev.map(r => (r.user_id ? { ...r, avatar_url: map.get(r.user_id) ?? null } : r)))
      })
    }

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
    const lastP = new Map<string, string>()        // each player → most-recent partner
    for (const game of doneGames) {
      for (const t of [game.team1_ids, game.team2_ids]) {
        for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) addPair(t[i], t[j])
        if (t.length === 2) { lastP.set(t[0], t[1]); lastP.set(t[1], t[0]) }   // later games overwrite
      }
      game.team1_ids.forEach(id => addPts(id, game.team1_score ?? 0))
      game.team2_ids.forEach(id => addPts(id, game.team2_score ?? 0))
    }
    setPartnered(pmap)
    setLastPartner(lastP)
    setPoints(pts)

    // Next round number (for staging round groups).
    const liveRoundNos = ((g as Game[]) ?? []).map(x => x.round_no ?? 0)
    const doneRoundNos = doneGames.map(x => x.round_no ?? 0)
    setNextRoundNo(Math.max(0, ...liveRoundNos, ...doneRoundNos) + 1)
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
  // Empty (placeholder) On Deck groups shouldn't count as "covering" a court for
  // auto-stage — otherwise a manually-added empty group blocks Keep-courts-busy.
  const stagedFilledCount = stagedGroups.filter(g => g.team1_ids.length + g.team2_ids.length > 0).length
  const isFormat = session?.match_mode === 'americano' || session?.match_mode === 'mexicano' || session?.match_mode === 'king'
  const isKing = session?.match_mode === 'king'
  const occupiedCourts = new Set(liveGames.map(g => g.court_number))
  const freeCourts = session
    ? Array.from({ length: session.court_count }, (_, i) => i + 1).filter(c => !occupiedCourts.has(c))
    : []
  const playingCount = players.filter(p => p.status === 'playing').length
  const OVERTIME_MIN = 15

  // "Keep courts busy": whenever a court is open and there are enough players
  // waiting, auto-stage the next matchup On Deck so it's ready to send with one
  // tap — no waiting for the whole round to finish. Organizers review/swap first.
  const autoStageBusy = useRef(false)
  useEffect(() => {
    if (!session || !isOrganizer || !session.auto_stage || busy || isScheduled) return
    if (autoStageBusy.current) return
    if (session.match_mode === 'skill_courts') {
      if (freeCourts.length > 0 && bench.length >= perGame) {
        autoStageBusy.current = true
        fillSkillCourts(true).finally(() => { autoStageBusy.current = false })
      }
    } else if (freeCourts.length > stagedFilledCount && bench.length >= perGame) {
      autoStageBusy.current = true
      fillOpenCourts().finally(() => { autoStageBusy.current = false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, games, session?.auto_stage])

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
    else if (id) {
      pushPlayer(id as string, name, '#64748b', null, null)
      const lvl = (session?.match_mode === 'skill' || session?.match_mode === 'skill_courts') ? guestLevel : null
      const gen = session?.match_mode === 'mixed' ? guestGender : null
      if (lvl != null || gen != null) {
        await supabase.rpc('set_session_player_meta', { p_player_id: id, p_skill_level: lvl, p_gender: gen })
        if (session) loadState(session.id)
      }
    }
  }

  async function rpc(fn: string, args: Record<string, unknown>, successReload = true) {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    if (error) toast({ title: 'Something went wrong', description: error.message, variant: 'destructive' })
    else if (successReload && session) await loadState(session.id)
    setBusy(false)
    return !error
  }

  // One place that turns a pool of available players into `count` on-deck games,
  // honouring the session's matching style. Mexicano/King/Drop-in select the
  // fewest-games players first (so the most-played sit out); Skill-separated and
  // Mixed Doubles select by attribute, so they get the whole pool.
  function buildGroups(pool: SP[], count: number) {
    if (!session || count <= 0) return []
    const fmt = session.format
    if (session.match_mode === 'skill_courts') return []   // court-bound; handled by fillSkillCourts
    if (session.match_mode === 'skill') {
      return buildSkillGroups(pool.map(p => ({ id: p.id, level: p.skill_level ?? 3, games: p.games })), fmt, count, 2)
    }
    if (session.match_mode === 'mixed') {
      return buildMixedGroups(pool.map(p => ({ id: p.id, gender: p.gender ?? null, games: p.games })), count)
    }
    // Only seat as many as we can actually fill courts for, picking the fewest-
    // games players first — otherwise the points/win ranking below would keep
    // re-selecting the leaders and the long-waiters would never get on.
    const seats = Math.min(count, Math.floor(pool.length / perGame)) * perGame
    const playing = [...pool].sort((a, b) => a.games - b.games || new Date(a.queued_since).getTime() - new Date(b.queued_since).getTime())
      .slice(0, seats)
    if (session.match_mode === 'mexicano') {
      const ranked = [...playing].sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0) || b.wins - a.wins)
      return buildMexicanoRound(ranked, fmt, count)
    }
    if (session.match_mode === 'king') {
      if (session.partner_rotation === 'keep') return buildKingKeepTeams(playing.map(p => ({ id: p.id, wins: p.wins })), lastPartner, fmt)
      const ranked = [...playing].sort((a, b) => b.wins - a.wins || (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0) || a.losses - b.losses)
      return buildMexicanoRound(ranked, fmt, count)
    }
    const roster: RosterPlayer[] = playing.map(p => ({ id: p.id, skill: p.skill, games: p.games, waitMs: Date.now() - new Date(p.queued_since).getTime() }))
    return buildFairGroups(roster, fmt, count, partnered)
  }

  async function stageGroups(groups: { team1: string[]; team2: string[] }[]) {
    if (!session || groups.length === 0) return
    setBusy(true)
    for (let i = 0; i < groups.length; i++) {
      const { error } = await supabase.rpc('stage_session_group', {
        p_session_id: session.id, p_team1: groups[i].team1, p_team2: groups[i].team2, p_rank: i + 1, p_round: nextRoundNo,
      })
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); break }
    }
    await loadState(session.id)
    setBusy(false)
  }

  // Auto Fill builds on-deck groups, up to one per court, so you can line up the
  // next round even while courts are busy.
  async function autoFill() {
    if (!session) return
    if (session.match_mode === 'skill_courts') { await fillSkillCourts(); return }
    const maxGroups = Math.max(0, session.court_count - stagedGroups.length)
    if (maxGroups <= 0) { toast({ title: 'On Deck is full', description: 'Send a group to a court to free up an On Deck slot.' }); return }
    const groups = buildGroups(bench, maxGroups)
    if (groups.length === 0) { toast({ title: matchModeNeedHint(), variant: 'destructive' }); return }
    await stageGroups(groups)
  }

  const addEmptyGroup = () => session && rpc('stage_session_group', { p_session_id: session.id, p_team1: [], p_team2: [] })

  // Stage just enough groups to cover the currently-open courts (the "keep courts
  // busy" auto-stager + a manual one-tap).
  async function fillOpenCourts() {
    if (!session) return
    const need = freeCourts.length - stagedFilledCount
    const groups = buildGroups(bench, Math.max(0, need))
    if (groups.length === 0) return
    await stageGroups(groups)
  }

  function matchModeNeedHint() {
    if (session?.match_mode === 'mixed') return 'Need 2 men and 2 women on the bench (tag genders below)'
    if (session?.match_mode === 'skill') return `Need ${perGame} players of a similar level on the bench`
    if (session?.match_mode === 'skill_courts') return 'No court has enough players in its skill tier yet'
    return `Need ${perGame} on the bench`
  }

  // Skill Courts: each free court pulls its next game from its own skill tier
  // (court 1 = strongest) and goes straight on — courts stay tier-locked.
  async function fillSkillCourts(auto = false) {
    if (!session) return
    const cc = session.court_count
    const used = new Set<string>()
    const assigns: { team1: string[]; team2: string[]; court: number }[] = []
    for (const c of freeCourts) {
      const pool = bench.filter(p => !used.has(p.id) && courtForLevel(p.skill_level ?? 3, cc) === c)
        .sort((a, b) => a.games - b.games || new Date(a.queued_since).getTime() - new Date(b.queued_since).getTime())
      if (pool.length < perGame) continue
      const id = pool.slice(0, perGame).map(p => p.id)
      id.forEach(x => used.add(x))
      assigns.push(session.format === 'doubles'
        ? { team1: [id[0], id[3]], team2: [id[1], id[2]], court: c }
        : { team1: [id[0]], team2: [id[1]], court: c })
    }
    if (assigns.length === 0) { if (!auto) toast({ title: matchModeNeedHint(), variant: 'destructive' }); return }
    setBusy(true)
    for (const a of assigns) {
      const { data: gid, error } = await supabase.rpc('stage_session_group', { p_session_id: session.id, p_team1: a.team1, p_team2: a.team2 })
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); break }
      if (gid) await supabase.rpc('assign_session_group', { p_game_id: gid as string, p_court: a.court })
    }
    await loadState(session.id)
    setBusy(false)
  }

  // Pair the whole bench into On Deck groups at once (Drop-in convenience).
  async function pairAll() {
    if (!session) return
    const groups = buildGroups(bench, Math.floor(bench.length / perGame))
    if (groups.length === 0) { toast({ title: matchModeNeedHint(), variant: 'destructive' }); return }
    await stageGroups(groups)
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

  // Tap a player (bench or staged) to pick it up, then tap another player to
  // swap, or an empty slot to place/move it.
  function teamsWith(g: Game, addId: string): [string[], string[]] {
    const cap = perGame / 2
    const t1 = [...g.team1_ids], t2 = [...g.team2_ids]
    if (t1.length < cap) t1.push(addId); else t2.push(addId)
    return [t1, t2]
  }
  const gameById = (id: string) => games.find(g => g.id === id)
  const pickName = () => pick ? nameOf(pick.pid) : ''

  // Tap a player chip (bench or in a staged group).
  function tapPlayer(target: { kind: 'bench'; pid: string } | { kind: 'slot'; gameId: string; pid: string }) {
    if (!isOrganizer) return
    if (!pick) { setPick(target); return }
    const same = pick.pid === target.pid && pick.kind === target.kind &&
      (pick.kind === 'bench' || (target.kind === 'slot' && pick.kind === 'slot' && pick.gameId === target.gameId))
    if (same) { setPick(null); return }
    const a = pick, b = target
    setPick(null)
    swapPicks(a, b)
  }

  async function swapPicks(
    a: { kind: 'bench'; pid: string } | { kind: 'slot'; gameId: string; pid: string },
    b: { kind: 'bench'; pid: string } | { kind: 'slot'; gameId: string; pid: string },
  ) {
    if (a.kind === 'bench' && b.kind === 'bench') return   // both already on the bench
    if (a.kind === 'slot' && b.kind === 'slot') {
      if (a.gameId === b.gameId) {
        const g = gameById(a.gameId); if (!g) return
        const sw = (arr: string[]) => arr.map(x => x === a.pid ? b.pid : x === b.pid ? a.pid : x)
        await rpc('set_session_group', { p_game_id: g.id, p_team1: sw(g.team1_ids), p_team2: sw(g.team2_ids) })
      } else {
        await rpc('swap_staged_players', { p_game_a: a.gameId, p_a: a.pid, p_game_b: b.gameId, p_b: b.pid })
      }
      return
    }
    // one bench + one staged → bench player takes the staged seat, staged player benched
    const benchId = a.kind === 'bench' ? a.pid : b.pid
    const slot = (a.kind === 'slot' ? a : b) as { kind: 'slot'; gameId: string; pid: string }
    const g = gameById(slot.gameId); if (!g) return
    await rpc('set_session_group', {
      p_game_id: g.id,
      p_team1: g.team1_ids.map(x => x === slot.pid ? benchId : x),
      p_team2: g.team2_ids.map(x => x === slot.pid ? benchId : x),
    })
  }

  // Tap an empty slot in a staged group with a player picked up.
  async function placeInGroup(g: Game) {
    if (!pick || (g.team1_ids.length + g.team2_ids.length) >= perGame) return
    const p = pick
    setPick(null)
    if (p.kind === 'bench') {
      const [t1, t2] = teamsWith(g, p.pid)
      await rpc('set_session_group', { p_game_id: g.id, p_team1: t1, p_team2: t2 })
    } else {
      if (p.gameId === g.id) return
      const src = gameById(p.gameId); if (!src) return
      // remove from the source group (player → queue), then add to this one
      await supabase.rpc('set_session_group', { p_game_id: src.id, p_team1: src.team1_ids.filter(x => x !== p.pid), p_team2: src.team2_ids.filter(x => x !== p.pid) })
      const [t1, t2] = teamsWith(g, p.pid)
      await supabase.rpc('set_session_group', { p_game_id: g.id, p_team1: t1, p_team2: t2 })
      if (session) await loadState(session.id)
    }
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
  // Otherwise a bench tap feeds the pick/swap model.
  async function benchTap(pid: string) {
    if (subTarget) {
      const ok = await rpc('sub_session_player', { p_game_id: subTarget.gameId, p_out: subTarget.outId, p_in: pid })
      if (ok) setSubTarget(null)
      return
    }
    tapPlayer({ kind: 'bench', pid })
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

  async function toggleAutoStage() {
    if (!session) return
    const { error } = await supabase.rpc('set_session_auto_stage', { p_session_id: session.id, p_auto: !session.auto_stage })
    if (error) toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
    else setSession({ ...session, auto_stage: !session.auto_stage })
  }

  async function setPartnerRotation(mode: 'split' | 'keep') {
    if (!session || session.partner_rotation === mode) return
    const { error } = await supabase.rpc('set_session_partner_rotation', { p_session_id: session.id, p_mode: mode })
    if (error) toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
    else setSession({ ...session, partner_rotation: mode })
  }

  // Tag a player's skill level / gender (used for Skill-separated & Mixed Doubles).
  async function setMeta(playerId: string, skillLevel: number | null, gender: string | null) {
    const { error } = await supabase.rpc('set_session_player_meta', { p_player_id: playerId, p_skill_level: skillLevel, p_gender: gender })
    if (error) toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
    else if (session) loadState(session.id)
  }
  const cycleLevel = (p: SP) => setMeta(p.id, ((p.skill_level ?? 3) % 5) + 1, null)
  const cycleGender = (p: SP) => setMeta(p.id, null, p.gender === 'm' ? 'f' : 'm')

  async function endSession() {
    if (!session) return
    if (!window.confirm('End this session and see the recap?')) return
    const endedId = session.id
    const { error } = await supabase.rpc('end_play_session', { p_session_id: endedId })
    if (error) toast({ title: 'Could not end', description: error.message, variant: 'destructive' })
    else { if (solo) clearActiveHost(); setRecapId(endedId); setSession(null); fetchSessions() }
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

  if (loading) return <OpenPlaySkeleton />

  // ── History ─────────────────────────────────────────────────────────────────
  if (showHistory) return <LeagueOpenPlayHistory leagueId={leagueId} createdBy={solo ? userId : null} onBack={() => setShowHistory(false)} />

  // ── No selected session: empty state ────────────────────────────────────────
  if (!session && !creating) {
    if (solo) {
      return (
        <>
          <div className="text-center py-16">
            <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400 mb-4">No active session.</p>
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" asChild><Link href="/play/new"><Plus className="w-4 h-4 mr-1" />Start a session</Link></Button>
              <Button size="sm" variant="outline" onClick={() => setShowHistory(true)}><History className="w-4 h-4 mr-1" />History</Button>
            </div>
          </div>
          {recapId && <SessionRecap sessionId={recapId} onClose={() => setRecapId(null)} />}
        </>
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
      <>
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
        {recapId && <SessionRecap sessionId={recapId} onClose={() => setRecapId(null)} />}
      </>
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
                { k: 'skill', label: 'Skill-separated', desc: 'Keep levels close' },
                { k: 'mixed', label: 'Mixed Doubles', desc: '2 men + 2 women' },
                { k: 'skill_courts', label: 'Skill Courts', desc: 'Each court a level tier' },
              ] as const).map(m => (
                <button key={m.k} type="button" onClick={() => setMode(m.k)}
                  className={`text-left px-3 py-2 rounded-lg border ${mode === m.k ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'}`}>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-[10px] text-gray-400">{m.desc}</span>
                </button>
              ))}
            </div>
            <StyleExplainer mode={mode} courtCount={selectedCourts.length} />
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

      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
            <span className="truncate">{session.name}</span>
            {session.rated && <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">RATED</span>}
            {isScheduled && <span className="text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">SCHEDULED</span>}
            <StyleBadge mode={session.match_mode} courtCount={session.court_count} />
          </h2>
          <p className="text-xs text-gray-400 capitalize">
            {session.format} · {session.court_count} courts
            {session.starts_at && session.ends_at && (
              <span className="normal-case"> · {new Date(session.starts_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}–{new Date(session.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            )}
          </p>
        </div>

        {/* Desktop: full action row */}
        <div className="hidden sm:flex gap-2 shrink-0">
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

        {/* Mobile: overflow menu (Add player lives in the Bench section below) */}
        <div className="flex sm:hidden shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="px-2"><MoreHorizontal className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={copyShare}>{copied ? <Check className="w-4 h-4 mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}{copied ? 'Link copied!' : 'Share invite link'}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQrOpen(true)}><QrCode className="w-4 h-4 mr-2" />QR check-in</DropdownMenuItem>
              <DropdownMenuItem asChild><a href={`/play/${session.share_code}/board`} target="_blank" rel="noopener noreferrer"><Monitor className="w-4 h-4 mr-2" />Open board view</a></DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowHistory(true)}><History className="w-4 h-4 mr-2" />Past sessions</DropdownMenuItem>
              {isOrganizer && <><DropdownMenuSeparator /><DropdownMenuItem onClick={endSession} className="text-red-600 focus:text-red-600"><Power className="w-4 h-4 mr-2" />End session</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isOrganizer && (
        <div className="space-y-1.5 mb-4">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={session.allow_self_join} onChange={toggleSelfJoin} />
            <span>Let players check themselves in from the share link (no account needed)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={session.auto_stage} onChange={toggleAutoStage} />
            <span><strong>Keep courts busy</strong> — auto-stage the next game On Deck when a court frees (tap to send). Off = strict round-by-round.</span>
          </label>
          {isKing && session.format === 'doubles' && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-medium">Partners:</span>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                <button onClick={() => setPartnerRotation('split')} className={`px-2.5 py-1 ${session.partner_rotation !== 'keep' ? 'bg-green-600 text-white font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>Split &amp; remix</button>
                <button onClick={() => setPartnerRotation('keep')} className={`px-2.5 py-1 border-l border-gray-200 ${session.partner_rotation === 'keep' ? 'bg-green-600 text-white font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>Keep teams together</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Scoreboard console (softened dark) ──────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl p-4 sm:p-5 mb-2 shadow-sm">
        {/* Player totals — 2×2 on phones, 4-across on larger screens */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {[
            { label: 'Checked in', val: players.filter(p => p.status !== 'left').length, accent: 'border-sky-500', color: 'text-white' },
            { label: 'Ready', val: bench.length, accent: 'border-green-500', color: 'text-green-400' },
            { label: 'Playing', val: playingCount, accent: 'border-violet-500', color: 'text-white' },
            { label: 'Resting', val: resting.length, accent: 'border-amber-500', color: 'text-white' },
          ].map(s => (
            <div key={s.label} className={`bg-slate-800 rounded-xl px-3 py-2 border-t-2 ${s.accent} flex items-center justify-between sm:block`}>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{s.label}</div>
              <div className={`text-2xl sm:text-xl font-bold ${s.color}`}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Courts */}
        <div className="text-[11px] uppercase tracking-[0.18em] text-green-400 font-bold mb-2.5">Courts</div>
        <div className="grid sm:grid-cols-2 gap-2.5 mb-6">
          {Array.from({ length: session.court_count }, (_, i) => i + 1).map(courtNo => {
            const game = liveGames.find(g => g.court_number === courtNo)
            return (
              <div key={courtNo} className={`bg-slate-800 border border-slate-700/60 rounded-xl p-3 border-l-[3px] ${game ? 'border-l-green-500' : 'border-l-slate-600'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-bold italic text-sm">
                    COURT {courtNo}
                    {isKing && courtNo === 1 && <span className="ml-1.5 text-[9px] not-italic font-bold text-amber-300 bg-amber-500/20 rounded px-1.5 py-0.5 align-middle">KINGS</span>}
                    {isKing && courtNo === session.court_count && session.court_count > 1 && <span className="ml-1.5 text-[9px] not-italic font-medium text-slate-400 align-middle">bottom</span>}
                  </span>
                  {game ? (
                    <LiveTimer from={game.started_at} overtimeMin={OVERTIME_MIN}
                      className="text-[11px] text-green-400 font-medium tabular-nums"
                      overtimeClassName="text-[9px] uppercase tracking-wide font-bold text-white bg-red-500 rounded px-1.5 py-0.5" />
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
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-green-400 font-bold">On Deck</span>
              <button onClick={() => setAnnounce(a => !a)}
                className={`rounded-lg p-2.5 flex items-center ${announce ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                title={announce ? 'Voice call-outs on' : 'Voice call-outs off'}>
                {announce ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              {isFormat ? (
                stagedGroups.length > 0 ? (
                  <button onClick={startRound} disabled={busy || freeCourts.length === 0}
                    className="flex-1 text-xs uppercase tracking-wide font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl py-3 flex items-center justify-center gap-1.5">
                    <Play className="w-4 h-4" />Send to {freeCourts.length === 1 ? 'court' : 'open courts'}
                  </button>
                ) : (
                  <button onClick={fillOpenCourts} disabled={busy || freeCourts.length === 0 || bench.length < perGame}
                    className="flex-1 text-xs uppercase tracking-wide font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl py-3 flex items-center justify-center gap-1.5"
                    title="Build games On Deck for the open courts — review and swap before sending">
                    <Wand2 className="w-4 h-4" />{liveGames.length > 0 ? `Fill open court${freeCourts.length > 1 ? 's' : ''}` : 'Generate round'}
                  </button>
                )
              ) : (
                <>
                  <button onClick={autoFill} disabled={busy}
                    className="flex-1 text-xs uppercase tracking-wide font-bold text-white bg-green-600 hover:bg-green-500 rounded-xl py-3 flex items-center justify-center gap-1.5">
                    <Wand2 className="w-4 h-4" />Auto fill
                  </button>
                  <button onClick={pairAll} disabled={busy}
                    className="text-xs uppercase tracking-wide font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 flex items-center gap-1.5">
                    Pair all
                  </button>
                  <button onClick={addEmptyGroup} disabled={busy} title="Add an empty group"
                    className="text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl px-3.5 py-3 flex items-center">
                    <Plus className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            {pick && (
              <p className="text-[11px] text-green-300 mb-2">Picked <strong>{pickName()}</strong> — tap another player to swap, or an empty slot to place · <button onClick={() => setPick(null)} className="underline">cancel</button></p>
            )}
            {stagedGroups.length === 0 ? (
              <p className="text-[12px] text-slate-500 mb-6">
                {isFormat
                  ? <>No round staged yet. Hit <strong className="text-slate-300">Generate round</strong> — it builds this round&apos;s games On Deck so you can review and swap, then send to courts. {session.auto_stage && <>With <strong className="text-slate-300">Keep courts busy</strong> on, the next game also appears here automatically whenever a court frees.</>}</>
                  : <>No groups staged. Hit <strong className="text-slate-300">Auto fill</strong> (fills free courts) or <strong className="text-slate-300">Pair all</strong> (pairs the whole bench), then tweak before sending.</>}
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5 mb-6">
                {[...stagedGroups].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map((g, gi) => {
                  const ids = [...g.team1_ids, ...g.team2_ids]
                  const full = ids.length >= perGame
                  const label = isFormat ? `Game ${gi + 1}` : `Group ${gi + 1}`
                  const teamCap = perGame / 2
                  const renderChip = (id: string) => {
                    const picked = pick?.kind === 'slot' && pick.gameId === g.id && pick.pid === id
                    return (
                      <span key={id} className={`inline-flex items-center gap-0.5 rounded-full pl-3 pr-1 py-1 ${picked ? 'bg-green-500/25 ring-1 ring-green-400' : 'bg-slate-700'}`}>
                        <button onClick={() => tapPlayer({ kind: 'slot', gameId: g.id, pid: id })} className="text-[13px] text-slate-100 leading-none">{nameOf(id)}</button>
                        <button onClick={() => removeFromGroup(g, id)} title="Remove from group"
                          className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/70 shrink-0"><X className="w-3 h-3" /></button>
                      </span>
                    )
                  }
                  return (
                    <div key={g.id} className={`bg-slate-800 border rounded-xl p-3 ${pick ? 'border-green-500/40' : 'border-slate-700/60'}`}>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[12px] text-slate-400 font-medium">
                          {label}
                          {isKing && gi === 0 && <span className="ml-1.5 text-[9px] font-bold text-amber-300 bg-amber-500/20 rounded px-1.5 py-0.5">KINGS</span>}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleLock(g)} className={`p-1.5 rounded-lg ${g.locked ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`} title={g.locked ? 'Unlock' : 'Lock'}>
                            {g.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </button>
                          <button onClick={() => disband(g)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400" title="Disband"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      {/* Team A vs Team B */}
                      {([g.team1_ids, g.team2_ids] as const).map((teamIds, ti) => (
                        <div key={ti}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {teamIds.map(renderChip)}
                            {Array.from({ length: Math.max(0, teamCap - teamIds.length) }).map((_, k) => (
                              <button key={k} onClick={() => placeInGroup(g)} disabled={!pick}
                                className={`rounded-full px-3 py-1.5 text-[12px] border border-dashed ${pick ? 'border-green-400 text-green-300 hover:bg-green-500/10' : 'border-slate-600 text-slate-500'}`}>
                                {pick ? 'place here' : 'empty'}
                              </button>
                            ))}
                          </div>
                          {ti === 0 && <div className="text-[10px] font-bold text-slate-500 my-1.5 pl-1">vs</div>}
                        </div>
                      ))}
                      {full && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-700/60">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">Send to</span>
                          {freeCourts.length === 0
                            ? <span className="text-[11px] text-slate-500">waiting for a court…</span>
                            : freeCourts.map(c => (
                              <button key={c} onClick={() => sendToCourt(g, c)} disabled={busy}
                                className="text-[11px] uppercase font-bold text-white bg-green-600 hover:bg-green-500 rounded-lg px-3.5 py-1.5">Court {c}</button>
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
            <button onClick={openAdd} className="text-[11px] uppercase tracking-wide font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />Add player
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
            const sel = pick?.kind === 'bench' && pick.pid === p.id
            return (
              <div key={p.id} className={`flex items-center gap-2 rounded-xl pl-3 pr-1.5 py-1.5 ${sel ? 'bg-green-500/15 ring-1 ring-green-500' : 'bg-slate-800'}`}>
                <button onClick={() => isOrganizer && benchTap(p.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left py-1" disabled={!isOrganizer}>
                  <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url ?? null} size="xs" />
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-100 truncate">
                      {p.display_name}
                      {!p.user_id && <span className="text-[10px] text-slate-500 ml-1">guest</span>}
                    </span>
                    <span className="block text-[10px] text-slate-500 tabular-nums">waited <LiveTimer from={p.queued_since} /> · {p.games}g</span>
                  </span>
                </button>
                {isOrganizer && (session.match_mode === 'skill' || session.match_mode === 'skill_courts') && (
                  <button onClick={() => cycleLevel(p)} title="Tap to change level"
                    className="w-7 h-7 rounded-lg text-[13px] font-bold bg-slate-700 text-slate-200 hover:bg-slate-600 shrink-0">{p.skill_level ?? 3}</button>
                )}
                {isOrganizer && session.match_mode === 'mixed' && (
                  <button onClick={() => cycleGender(p)} title="Tap to set M/F"
                    className={`w-7 h-7 rounded-lg text-[13px] font-bold shrink-0 ${p.gender ? 'bg-green-600 text-white' : 'bg-amber-500/80 text-white'}`}>{p.gender === 'm' ? 'M' : p.gender === 'f' ? 'F' : '?'}</button>
                )}
                {isOrganizer && (
                  <>
                    <button onClick={() => setStatus(p.id, 'resting')} className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-700/50 shrink-0" title="Rest"><Pause className="w-4 h-4" /></button>
                    <button onClick={() => setStatus(p.id, 'left')} className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700/50 shrink-0" title="Remove"><X className="w-4 h-4" /></button>
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

      {recapId && <SessionRecap sessionId={recapId} onClose={() => setRecapId(null)} />}

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
                {!solo && (
                  <Button variant="outline" size="icon" onClick={saveRegular} disabled={!guestName.trim()} title="Save as a regular">
                    <Star className="w-4 h-4" />
                  </Button>
                )}
                <Button onClick={addGuest} disabled={!guestName.trim()}>Add</Button>
              </div>
              {(session.match_mode === 'skill' || session.match_mode === 'skill_courts') && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-500">Level</span>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setGuestLevel(n)}
                      className={`w-7 h-7 rounded-lg text-sm font-semibold ${guestLevel === n ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{n}</button>
                  ))}
                </div>
              )}
              {session.match_mode === 'mixed' && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-500">Gender</span>
                  {(['m', 'f'] as const).map(g => (
                    <button key={g} type="button" onClick={() => setGuestGender(g)}
                      className={`px-3 h-7 rounded-lg text-sm font-semibold ${guestGender === g ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{g === 'm' ? 'Man' : 'Woman'}</button>
                  ))}
                </div>
              )}
              {!solo && <p className="text-xs text-gray-400">Tap the star to save a frequent player for next time.</p>}
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
