'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { PlayerAvatar } from '@/components/player-avatar'
import { TournamentBracket, type BracketMatch, type BracketPlayer } from '@/components/tournaments/tournament-bracket'
import { divisionRuleSummary } from '@/components/tournaments/division-presets'
import { validatePickleballScore } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, Trophy, UserPlus, LogOut, Play } from 'lucide-react'

export interface Division {
  id: string
  name: string
  format: 'singles' | 'doubles' | 'mixed_doubles'
  bracket_type: 'single_elim' | 'round_robin'
  gender: 'open' | 'men' | 'women' | 'mixed'
  min_age: number | null
  max_age: number | null
  min_rating: number | null
  max_rating: number | null
  status: 'registration' | 'active' | 'completed'
  winner_entry_id: string | null
}

interface Entry {
  id: string
  user_id: string
  partner_id: string | null
  seed: number | null
  name: string
  avatar_color: string
  avatar_url: string | null
}

interface DivMatch {
  id: string
  round: number
  position: number
  entry1_id: string | null
  entry2_id: string | null
  winner_entry_id: string | null
  score1: number | null
  score2: number | null
  status: 'pending' | 'ready' | 'completed' | 'bye'
}

interface Member {
  user_id: string
  profiles: { display_name: string; avatar_color: string; avatar_url: string | null }
}

export function computeStandings(entries: Entry[], matches: DivMatch[]) {
  return entries.map(e => {
    let wins = 0, losses = 0, diff = 0
    for (const m of matches) {
      if (m.status !== 'completed') continue
      if (m.entry1_id === e.id) {
        diff += (m.score1 ?? 0) - (m.score2 ?? 0)
        if (m.winner_entry_id === e.id) wins++; else losses++
      } else if (m.entry2_id === e.id) {
        diff += (m.score2 ?? 0) - (m.score1 ?? 0)
        if (m.winner_entry_id === e.id) wins++; else losses++
      }
    }
    return { entry: e, wins, losses, diff }
  }).sort((a, b) => b.wins - a.wins || b.diff - a.diff)
}

export function DivisionView({
  division, leagueId, currentUserId, isAdmin, canReport, onBack, onChanged,
}: {
  division: Division
  leagueId: string
  currentUserId: string
  isAdmin: boolean
  canReport: boolean
  onBack: () => void
  onChanged: () => void
}) {
  const [div, setDiv] = useState<Division>(division)
  const [entries, setEntries] = useState<Entry[]>([])
  const [matches, setMatches] = useState<DivMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [eligibilityReason, setEligibilityReason] = useState<string | null>(null)

  // Register dialog (partner pick for doubles/mixed)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [partnerId, setPartnerId] = useState('')
  const [registering, setRegistering] = useState(false)

  // Score dialog
  const [scoreMatch, setScoreMatch] = useState<DivMatch | null>(null)
  const [score1, setScore1] = useState('')
  const [score2, setScore2] = useState('')
  const [reporting, setReporting] = useState(false)
  const [starting, setStarting] = useState(false)

  const { toast } = useToast()
  const supabase = createClient()

  async function fetchAll() {
    const [{ data: d }, { data: es }, { data: ms }] = await Promise.all([
      supabase.from('tournament_divisions').select('*').eq('id', division.id).single(),
      supabase.from('division_entries').select('*').eq('division_id', division.id).order('seed', { ascending: true, nullsFirst: false }),
      supabase.from('tournament_matches').select('*').eq('division_id', division.id).order('round').order('position'),
    ])
    if (d) setDiv(d as Division)

    const rawEntries = (es ?? []) as any[]
    const userIds = Array.from(new Set(rawEntries.flatMap(e => [e.user_id, e.partner_id]).filter(Boolean)))
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, display_name, avatar_color, avatar_url').in('id', userIds)
      : { data: [] }
    const pMap = new Map(((profiles ?? []) as any[]).map(p => [p.id, p]))

    setEntries(rawEntries.map(e => {
      const p1 = pMap.get(e.user_id)
      const p2 = e.partner_id ? pMap.get(e.partner_id) : null
      return {
        id: e.id, user_id: e.user_id, partner_id: e.partner_id, seed: e.seed,
        name: (p1?.display_name ?? 'Unknown') + (p2 ? ` & ${p2.display_name}` : ''),
        avatar_color: p1?.avatar_color ?? '#16a34a',
        avatar_url: p1?.avatar_url ?? null,
      }
    }))
    setMatches((ms ?? []) as DivMatch[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [division.id])

  // Pre-check eligibility so the register button can explain itself
  useEffect(() => {
    if (div.status !== 'registration') return
    supabase
      .rpc('division_eligibility_reason', { p_division_id: division.id, p_user_id: currentUserId })
      .then(({ data }) => setEligibilityReason(data ?? null))
  }, [division.id, div.status, currentUserId])

  const myEntry = entries.find(e => e.user_id === currentUserId || e.partner_id === currentUserId)
  const needsPartner = div.format !== 'singles'

  async function openRegister() {
    if (!needsPartner) {
      doRegister(null)
      return
    }
    setRegisterOpen(true)
    const { data } = await supabase
      .from('league_members')
      .select('user_id, profiles(display_name, avatar_color, avatar_url)')
      .eq('league_id', leagueId)
      .eq('status', 'active')
    setMembers(((data ?? []) as unknown as Member[]).filter(m => m.user_id !== currentUserId))
  }

  async function doRegister(partner: string | null) {
    setRegistering(true)
    const { error } = await supabase.rpc('register_for_division', {
      p_division_id: division.id,
      p_partner_id: partner,
    })
    if (error) {
      toast({ title: 'Could not register', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Registered! 🏆' })
      setRegisterOpen(false)
      setPartnerId('')
      fetchAll()
      onChanged()
    }
    setRegistering(false)
  }

  async function withdraw() {
    if (!myEntry) return
    const { error } = await supabase.rpc('withdraw_from_division', { p_entry_id: myEntry.id })
    if (error) toast({ title: 'Could not withdraw', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Withdrawn from division' }); fetchAll(); onChanged() }
  }

  async function startDivision() {
    setStarting(true)
    const { error } = await supabase.rpc('start_division', { p_division_id: division.id })
    if (error) toast({ title: 'Could not start division', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Bracket generated — division is live!' }); fetchAll(); onChanged() }
    setStarting(false)
  }

  async function handleReport() {
    if (!scoreMatch) return
    const s1 = parseInt(score1), s2 = parseInt(score2)
    const scoreError = validatePickleballScore(s1, s2, 11)
    if (scoreError) {
      toast({ ...scoreError, variant: 'destructive' })
      return
    }
    setReporting(true)
    const { error } = await supabase.rpc('report_division_match', {
      p_tm_id: scoreMatch.id, p_score1: s1, p_score2: s2,
    })
    if (error) {
      toast({ title: 'Failed to report score', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Score recorded — ELO updated' })
      setScoreMatch(null); setScore1(''); setScore2('')
      fetchAll(); onChanged()
    }
    setReporting(false)
  }

  const entryMap = new Map(entries.map(e => [e.id, e]))
  const winner = div.winner_entry_id ? entryMap.get(div.winner_entry_id) : null

  // Adapt entries/matches for the bracket renderer (entry id plays the role of user id)
  const bracketPlayers: BracketPlayer[] = entries.map(e => ({
    user_id: e.id, seed: e.seed ?? 0,
    display_name: e.name, avatar_color: e.avatar_color, avatar_url: e.avatar_url,
  }))
  const bracketMatches: BracketMatch[] = matches.map(m => ({
    id: m.id, round: m.round, position: m.position,
    player1_id: m.entry1_id, player2_id: m.entry2_id,
    winner_id: m.winner_entry_id, score1: m.score1, score2: m.score2,
    status: m.status,
  }))

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading division…</div>

  const standings = div.bracket_type === 'round_robin' ? computeStandings(entries, matches) : []

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground/90 mb-4">
        <ArrowLeft className="w-4 h-4" /> All divisions
      </button>

      <div className="mb-4">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          {div.name}
        </h3>
        <p className="text-xs text-muted-foreground/80 mt-0.5">{divisionRuleSummary(div as any)}</p>
        {winner && (
          <div className="mt-2 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-1.5">
            <span className="text-lg">🏆</span>
            <span className="text-sm font-semibold text-amber-300">{winner.name} wins!</span>
          </div>
        )}
      </div>

      {/* ── Registration phase ── */}
      {div.status === 'registration' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!myEntry ? (
              <>
                <Button size="sm" onClick={openRegister} disabled={!!eligibilityReason}>
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  {needsPartner ? 'Register with partner' : 'Register'}
                </Button>
                {eligibilityReason && (
                  <span className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-2.5 py-1.5">{eligibilityReason}</span>
                )}
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={withdraw}>
                <LogOut className="w-3.5 h-3.5 mr-1" /> Withdraw
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={startDivision} disabled={starting || entries.length < 2}>
                <Play className="w-3.5 h-3.5 mr-1" />
                {starting ? 'Generating…' : `Close registration & start (${entries.length})`}
              </Button>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">{entries.length} registered</p>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground/80 py-6 text-center">No entries yet — be the first!</p>
            ) : (
              <div className="space-y-1.5">
                {entries.map(e => (
                  <div key={e.id} className="flex items-center gap-2.5 bg-card border rounded-lg px-3 py-2">
                    <PlayerAvatar name={e.name} color={e.avatar_color} imageUrl={e.avatar_url} size="sm" />
                    <span className="text-sm font-medium text-foreground flex-1 truncate">{e.name}</span>
                    {(e.user_id === currentUserId || e.partner_id === currentUserId) && (
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/10 rounded-full px-2 py-0.5">YOU</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Active / completed: bracket or round robin ── */}
      {div.status !== 'registration' && (
        div.bracket_type === 'round_robin' ? (
          <div className="space-y-6">
            {/* Standings */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Standings</p>
              <div className="rounded-xl border overflow-hidden bg-card">
                {standings.map((s, i) => (
                  <div key={s.entry.id} className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 ${
                    div.winner_entry_id === s.entry.id ? 'bg-amber-500/10' : ''
                  }`}>
                    <span className="text-xs font-bold text-muted-foreground/80 w-5">{i + 1}</span>
                    <PlayerAvatar name={s.entry.name} color={s.entry.avatar_color} imageUrl={s.entry.avatar_url} size="sm" />
                    <span className="text-sm font-medium text-foreground flex-1 truncate">{s.entry.name}</span>
                    <span className="text-xs text-muted-foreground">{s.wins}W–{s.losses}L</span>
                    <span className={`text-xs font-mono w-12 text-right ${s.diff > 0 ? 'text-green-400' : s.diff < 0 ? 'text-red-400' : 'text-muted-foreground/80'}`}>
                      {s.diff > 0 ? '+' : ''}{s.diff}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Matches */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Matches</p>
              <div className="space-y-1.5">
                {matches.map(m => {
                  const e1 = m.entry1_id ? entryMap.get(m.entry1_id) : null
                  const e2 = m.entry2_id ? entryMap.get(m.entry2_id) : null
                  const reportable = canReport && m.status === 'ready'
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-2 bg-card border rounded-lg px-3 py-2 ${
                        reportable ? 'cursor-pointer hover:border-green-400' : ''
                      }`}
                      onClick={() => reportable && (setScoreMatch(m), setScore1(''), setScore2(''))}
                    >
                      <span className={`text-sm flex-1 text-right truncate ${m.winner_entry_id === m.entry1_id ? 'font-semibold' : ''}`}>{e1?.name}</span>
                      {m.status === 'completed' ? (
                        <span className="text-sm font-bold text-foreground/90 px-2 shrink-0">{m.score1} – {m.score2}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/80 px-2 shrink-0">vs</span>
                      )}
                      <span className={`text-sm flex-1 truncate ${m.winner_entry_id === m.entry2_id ? 'font-semibold' : ''}`}>{e2?.name}</span>
                      {reportable && <span className="text-[10px] text-green-400 font-medium shrink-0">Enter score</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <TournamentBracket
            players={bracketPlayers}
            matches={bracketMatches}
            canReport={canReport && div.status === 'active'}
            onReport={m => {
              const dm = matches.find(x => x.id === m.id)
              if (dm) { setScoreMatch(dm); setScore1(''); setScore2('') }
            }}
          />
        )
      )}

      {/* ── Partner-pick dialog ── */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="sm:max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pick your partner</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {div.gender === 'mixed' && (
              <p className="text-xs text-muted-foreground/80 mb-2">Mixed division — your partner must be the opposite gender.</p>
            )}
            {members.map(m => (
              <button
                key={m.user_id}
                onClick={() => setPartnerId(m.user_id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                  partnerId === m.user_id ? 'border-green-400 bg-green-500/10' : 'border-border hover:border-border'
                }`}
              >
                <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} imageUrl={m.profiles.avatar_url} size="sm" />
                <span className="text-sm flex-1 truncate">{m.profiles.display_name}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button onClick={() => doRegister(partnerId)} disabled={registering || !partnerId}>
              {registering ? 'Registering…' : 'Register team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Score dialog ── */}
      <Dialog open={!!scoreMatch} onOpenChange={v => { if (!v) setScoreMatch(null) }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Enter score</DialogTitle>
          </DialogHeader>
          {scoreMatch && (
            <div className="space-y-3">
              {[
                { id: scoreMatch.entry1_id, value: score1, set: setScore1 },
                { id: scoreMatch.entry2_id, value: score2, set: setScore2 },
              ].map((row, i) => {
                const e = row.id ? entryMap.get(row.id) : undefined
                return (
                  <div key={i} className="flex items-center gap-3">
                    {e && <PlayerAvatar name={e.name} color={e.avatar_color} imageUrl={e.avatar_url} size="sm" />}
                    <span className="text-sm flex-1 truncate">{e?.name ?? 'TBD'}</span>
                    <Input
                      type="number" min={0} className="w-20 text-center"
                      value={row.value}
                      onChange={ev => row.set(ev.target.value)}
                    />
                  </div>
                )
              })}
              <p className="text-xs text-muted-foreground/80">The result counts toward league ELO like any other match.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoreMatch(null)}>Cancel</Button>
            <Button onClick={handleReport} disabled={reporting}>
              {reporting ? 'Saving…' : 'Save result'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
