'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { PlayerAvatar } from '@/components/player-avatar'
import { TournamentBracket, type BracketMatch, type BracketPlayer } from '@/components/tournaments/tournament-bracket'
import { DivisionView, type Division } from '@/components/tournaments/division-view'
import {
  DIVISION_PRESETS, SKILL_CUTOFFS, divisionRuleSummary, type DivisionConfig,
} from '@/components/tournaments/division-presets'
import { validatePickleballScore } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Trophy, Plus, ArrowLeft, Link2, Check, X, Users, Trash2 } from 'lucide-react'

interface Tournament {
  id: string
  name: string
  status: 'active' | 'completed' | 'cancelled'
  share_code: string
  winner_id: string | null
  created_at: string
  completed_at: string | null
}

export function LeagueTournaments({
  leagueId, currentUserId, isAdmin, canReport,
}: {
  leagueId: string
  currentUserId: string
  isAdmin: boolean
  canReport: boolean
}) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Tournament | null>(null)

  // Division-based tournaments
  const [divisions, setDivisions] = useState<Division[]>([])
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({})
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null)

  // Legacy (v1, no divisions) bracket data
  const [legacyPlayers, setLegacyPlayers] = useState<BracketPlayer[]>([])
  const [legacyMatches, setLegacyMatches] = useState<BracketMatch[]>([])
  const [isLegacy, setIsLegacy] = useState(false)
  const [bracketLoading, setBracketLoading] = useState(false)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [chosenDivisions, setChosenDivisions] = useState<DivisionConfig[]>([])
  const [creating, setCreating] = useState(false)

  // Legacy score dialog
  const [scoreMatch, setScoreMatch] = useState<BracketMatch | null>(null)
  const [score1, setScore1] = useState('')
  const [score2, setScore2] = useState('')
  const [reporting, setReporting] = useState(false)

  const [copied, setCopied] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('tournaments').delete().eq('id', deleteTarget.id)
    if (error) {
      toast({ title: 'Failed to delete tournament', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: `"${deleteTarget.name}" deleted` })
      if (selected?.id === deleteTarget.id) { setSelected(null); setSelectedDivision(null) }
      fetchTournaments()
    }
    setDeleteTarget(null)
    setDeleting(false)
  }

  async function fetchTournaments() {
    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
    setTournaments((data as Tournament[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchTournaments() }, [leagueId])

  async function openTournament(t: Tournament) {
    setSelected(t)
    setSelectedDivision(null)
    setBracketLoading(true)

    const { data: divs } = await supabase
      .from('tournament_divisions')
      .select('*')
      .eq('tournament_id', t.id)
      .order('created_at')

    if (divs && divs.length > 0) {
      setIsLegacy(false)
      setDivisions(divs as Division[])
      const { data: counts } = await supabase
        .from('division_entries')
        .select('division_id')
        .in('division_id', (divs as any[]).map(d => d.id))
      const map: Record<string, number> = {}
      for (const row of (counts ?? []) as any[]) {
        map[row.division_id] = (map[row.division_id] ?? 0) + 1
      }
      setEntryCounts(map)
      setBracketLoading(false)
      return
    }

    // Legacy v1 tournament: single all-comers bracket
    setIsLegacy(true)
    const [{ data: tp }, { data: tm }] = await Promise.all([
      supabase.from('tournament_players').select('user_id, seed').eq('tournament_id', t.id).order('seed'),
      supabase.from('tournament_matches').select('*').eq('tournament_id', t.id).is('division_id', null).order('round').order('position'),
    ])
    const ids = ((tp ?? []) as any[]).map(p => p.user_id)
    const { data: profiles } = ids.length
      ? await supabase.from('profiles').select('id, display_name, avatar_color, avatar_url').in('id', ids)
      : { data: [] }
    const profileMap = new Map(((profiles ?? []) as any[]).map(p => [p.id, p]))
    setLegacyPlayers(((tp ?? []) as any[]).map(p => {
      const prof = profileMap.get(p.user_id)
      return {
        user_id: p.user_id, seed: p.seed,
        display_name: prof?.display_name ?? 'Unknown player',
        avatar_color: prof?.avatar_color ?? '#16a34a',
        avatar_url: prof?.avatar_url ?? null,
      }
    }))
    setLegacyMatches((tm as BracketMatch[]) ?? [])
    setBracketLoading(false)
  }

  async function refreshSelected() {
    if (!selected) return
    const { data: t } = await supabase.from('tournaments').select('*').eq('id', selected.id).single()
    if (t) setSelected(t as Tournament)
    const { data: divs } = await supabase
      .from('tournament_divisions').select('*').eq('tournament_id', selected.id).order('created_at')
    setDivisions((divs as Division[]) ?? [])
    fetchTournaments()
  }

  // ── Create flow ───────────────────────────────────────────────────────────
  function togglePreset(preset: DivisionConfig) {
    setChosenDivisions(prev =>
      prev.some(d => d.name === preset.name)
        ? prev.filter(d => d.name !== preset.name)
        : [...prev, preset]
    )
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast({ title: 'Give the tournament a name', variant: 'destructive' })
      return
    }
    if (chosenDivisions.length === 0) {
      toast({ title: 'Pick at least one division', variant: 'destructive' })
      return
    }
    setCreating(true)
    const { data: tid, error } = await supabase.rpc('create_tournament_with_divisions', {
      p_league_id: leagueId,
      p_name: name.trim(),
      p_divisions: chosenDivisions,
    })
    if (error) {
      toast({ title: 'Failed to create tournament', description: error.message, variant: 'destructive' })
      setCreating(false)
      return
    }
    toast({ title: 'Tournament created! 🏆', description: 'Registration is open for all divisions.' })
    setCreateOpen(false)
    setName('')
    setChosenDivisions([])
    setCreating(false)
    await fetchTournaments()
    const { data: t } = await supabase.from('tournaments').select('*').eq('id', tid).single()
    if (t) openTournament(t as Tournament)
  }

  // ── Legacy score reporting ────────────────────────────────────────────────
  async function handleLegacyReport() {
    if (!scoreMatch) return
    const s1 = parseInt(score1), s2 = parseInt(score2)
    const scoreError = validatePickleballScore(s1, s2, 11)
    if (scoreError) {
      toast({ ...scoreError, variant: 'destructive' })
      return
    }
    setReporting(true)
    const { error } = await supabase.rpc('report_tournament_match', {
      p_tm_id: scoreMatch.id, p_score1: s1, p_score2: s2,
    })
    if (error) {
      toast({ title: 'Failed to report score', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Score recorded — ELO updated' })
      setScoreMatch(null); setScore1(''); setScore2('')
      if (selected) openTournament(selected)
      fetchTournaments()
    }
    setReporting(false)
  }

  function copyShareLink(t: Tournament) {
    const url = `${window.location.origin}/tournaments/${t.share_code}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: 'Spectator link copied!', description: 'Anyone with this link can follow the brackets — no account needed.' })
  }

  const legacyPlayerMap = new Map(legacyPlayers.map(p => [p.user_id, p]))

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading tournaments…</div>

  // ── Tournament detail ──────────────────────────────────────────────────────
  if (selected) {
    const legacyWinner = selected.winner_id ? legacyPlayerMap.get(selected.winner_id) : null
    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <button
            onClick={() => { setSelected(null); setSelectedDivision(null) }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground/90"
          >
            <ArrowLeft className="w-4 h-4" /> All tournaments
          </button>
          <Button size="sm" variant="outline" onClick={() => copyShareLink(selected)}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}
            Share with spectators
          </Button>
        </div>

        {!selectedDivision && (
          <div className="mb-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              {selected.name}
            </h2>
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              Seeded by ELO within each division.{' '}
              <Link href="/tournaments-guide" className="underline hover:text-green-400">Learn how brackets work</Link>
            </p>
          </div>
        )}

        {bracketLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : selectedDivision ? (
          <DivisionView
            division={selectedDivision}
            leagueId={leagueId}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            canReport={canReport}
            onBack={() => { setSelectedDivision(null); refreshSelected() }}
            onChanged={refreshSelected}
          />
        ) : isLegacy ? (
          <>
            {selected.status === 'completed' && legacyWinner && (
              <div className="mb-4 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-1.5">
                <span className="text-lg">🏆</span>
                <PlayerAvatar name={legacyWinner.display_name} color={legacyWinner.avatar_color} imageUrl={legacyWinner.avatar_url} size="sm" />
                <span className="text-sm font-semibold text-amber-300">{legacyWinner.display_name} wins!</span>
              </div>
            )}
            <TournamentBracket
              players={legacyPlayers}
              matches={legacyMatches}
              canReport={canReport && selected.status === 'active'}
              onReport={m => { setScoreMatch(m); setScore1(''); setScore2('') }}
            />
          </>
        ) : (
          /* Division cards */
          <div className="space-y-2">
            {divisions.map(d => (
              <Card
                key={d.id}
                className="cursor-pointer hover:border-green-500/40 transition-colors"
                onClick={() => setSelectedDivision(d)}
              >
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <Trophy className={`w-4 h-4 shrink-0 ${
                    d.status === 'completed' ? 'text-amber-500' :
                    d.status === 'active' ? 'text-green-400' : 'text-muted-foreground/80'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground/80 truncate">{divisionRuleSummary(d as any)}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground/80 shrink-0">
                    <Users className="w-3 h-3" />
                    {entryCounts[d.id] ?? 0}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    d.status === 'registration' ? 'bg-blue-500/15 text-blue-300' :
                    d.status === 'active' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'
                  }`}>
                    {d.status === 'registration' ? 'Registration open' : d.status === 'active' ? 'In progress' : 'Completed'}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Legacy score entry dialog */}
        <Dialog open={!!scoreMatch} onOpenChange={v => { if (!v) setScoreMatch(null) }}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Enter score</DialogTitle>
            </DialogHeader>
            {scoreMatch && (
              <div className="space-y-3">
                {[
                  { id: scoreMatch.player1_id, value: score1, set: setScore1 },
                  { id: scoreMatch.player2_id, value: score2, set: setScore2 },
                ].map((row, i) => {
                  const p = row.id ? legacyPlayerMap.get(row.id) : undefined
                  return (
                    <div key={i} className="flex items-center gap-3">
                      {p && <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url} size="sm" />}
                      <span className="text-sm flex-1 truncate">{p?.display_name ?? 'TBD'}</span>
                      <Input
                        type="number" min={0} className="w-20 text-center"
                        value={row.value}
                        onChange={e => row.set(e.target.value)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setScoreMatch(null)}>Cancel</Button>
              <Button onClick={handleLegacyReport} disabled={reporting}>
                {reporting ? 'Saving…' : 'Save result'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''}
          </p>
          <Link href="/tournaments-guide" className="text-xs text-muted-foreground/80 hover:text-green-400 underline">
            How do brackets &amp; seeding work?
          </Link>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New tournament
          </Button>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/80">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm">No tournaments yet.{isAdmin ? ' Create one to get started!' : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tournaments.map(t => (
            <Card key={t.id} className="cursor-pointer hover:border-green-500/40 transition-colors" onClick={() => openTournament(t)}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Trophy className={`w-4 h-4 shrink-0 ${t.status === 'completed' ? 'text-amber-500' : 'text-green-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground/80">
                    {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  t.status === 'active' ? 'bg-green-500/15 text-green-300' :
                  t.status === 'completed' ? 'bg-amber-500/15 text-amber-300' : 'bg-muted text-muted-foreground'
                }`}>
                  {t.status === 'active' ? 'In progress' : t.status === 'completed' ? 'Completed' : 'Cancelled'}
                </span>
                {isAdmin && (
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(t) }}
                    className="text-muted-foreground/50 hover:text-red-400 transition-colors shrink-0 p-1"
                    title="Delete tournament"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-300">
              <Trash2 className="w-4 h-4" />
              Delete &ldquo;{deleteTarget?.name}&rdquo;?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the tournament, all divisions, registrations, and brackets permanently.
            Completed matches keep counting toward league ELO and player records.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete tournament'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create dialog (divisions builder) ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New tournament</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Event name</Label>
              <Input
                id="t-name" placeholder="e.g. Summer Slam 2026"
                value={name} onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Divisions ({chosenDivisions.length} selected)</Label>
              <p className="text-xs text-muted-foreground/80 -mt-1">
                Players register themselves into divisions they&apos;re eligible for.
                Eligibility (gender, age, rating) is enforced automatically.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {DIVISION_PRESETS.map(preset => {
                  const active = chosenDivisions.some(d => d.name === preset.name)
                  return (
                    <button
                      key={preset.name}
                      onClick={() => togglePreset(preset)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                        active
                          ? 'border-green-500 bg-green-500/10 text-green-300 font-medium'
                          : 'border-border text-muted-foreground hover:border-border'
                      }`}
                    >
                      {preset.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {chosenDivisions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Selected divisions</p>
                {chosenDivisions.map(d => (
                  <div key={d.name} className="flex items-center gap-2 bg-muted/40 border rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{d.name}</p>
                      <p className="text-xs text-muted-foreground/80">{divisionRuleSummary(d)}</p>
                    </div>
                    <select
                      value={d.bracket_type}
                      onChange={e => setChosenDivisions(prev => prev.map(x =>
                        x.name === d.name ? { ...x, bracket_type: e.target.value as any } : x
                      ))}
                      className="text-xs border rounded-md px-2 py-1 bg-card"
                    >
                      <option value="single_elim">Single elim</option>
                      <option value="round_robin">Round robin</option>
                    </select>
                    <button onClick={() => togglePreset(d)} className="text-muted-foreground/80 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground/80">
                  Tip: round robin suits small divisions (under ~6 entries) — everyone plays everyone.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || chosenDivisions.length === 0 || !name.trim()}>
              {creating ? 'Creating…' : 'Create & open registration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
