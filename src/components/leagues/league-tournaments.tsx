'use client'

import { useEffect, useState } from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { Trophy, Plus, ArrowLeft, Link2, Check } from 'lucide-react'

interface Tournament {
  id: string
  name: string
  status: 'active' | 'completed' | 'cancelled'
  share_code: string
  winner_id: string | null
  created_at: string
  completed_at: string | null
}

interface Member {
  user_id: string
  elo_rating: number
  profiles: { display_name: string; avatar_color: string; avatar_url: string | null }
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

  // Bracket data for selected tournament
  const [players, setPlayers] = useState<BracketPlayer[]>([])
  const [matches, setMatches] = useState<BracketMatch[]>([])
  const [bracketLoading, setBracketLoading] = useState(false)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  // Score dialog
  const [scoreMatch, setScoreMatch] = useState<BracketMatch | null>(null)
  const [score1, setScore1] = useState('')
  const [score2, setScore2] = useState('')
  const [reporting, setReporting] = useState(false)

  const [copied, setCopied] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

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
    setBracketLoading(true)
    const [{ data: tp }, { data: tm }] = await Promise.all([
      supabase
        .from('tournament_players')
        .select('user_id, seed')
        .eq('tournament_id', t.id)
        .order('seed'),
      supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', t.id)
        .order('round')
        .order('position'),
    ])
    // tournament_players.user_id references auth.users, not profiles, so the
    // implicit join doesn't resolve — fetch profiles separately.
    const ids = ((tp ?? []) as any[]).map(p => p.user_id)
    const { data: profiles } = ids.length
      ? await supabase
          .from('profiles')
          .select('id, display_name, avatar_color, avatar_url')
          .in('id', ids)
      : { data: [] }
    const profileMap = new Map(((profiles ?? []) as any[]).map(p => [p.id, p]))
    setPlayers(((tp ?? []) as any[]).map(p => {
      const prof = profileMap.get(p.user_id)
      return {
        user_id: p.user_id, seed: p.seed,
        display_name: prof?.display_name ?? 'Unknown player',
        avatar_color: prof?.avatar_color ?? '#16a34a',
        avatar_url: prof?.avatar_url ?? null,
      }
    }))
    setMatches((tm as BracketMatch[]) ?? [])
    setBracketLoading(false)
  }

  async function refreshBracket() {
    if (!selected) return
    const { data: tm } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', selected.id)
      .order('round')
      .order('position')
    setMatches((tm as BracketMatch[]) ?? [])
    const { data: t } = await supabase
      .from('tournaments').select('*').eq('id', selected.id).single()
    if (t) setSelected(t as Tournament)
    fetchTournaments()
  }

  async function openCreate() {
    setCreateOpen(true)
    const { data } = await supabase
      .from('league_members')
      .select('user_id, elo_rating, profiles(display_name, avatar_color, avatar_url)')
      .eq('league_id', leagueId)
      .eq('status', 'active')
      .order('elo_rating', { ascending: false })
    const list = (data as unknown as Member[]) ?? []
    setMembers(list)
    setSelectedIds(new Set(list.map(m => m.user_id)))
  }

  function togglePlayer(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast({ title: 'Give the tournament a name', variant: 'destructive' })
      return
    }
    if (selectedIds.size < 2) {
      toast({ title: 'Select at least 2 players', variant: 'destructive' })
      return
    }
    setCreating(true)
    const { data: tid, error } = await supabase.rpc('create_tournament', {
      p_league_id: leagueId,
      p_name: name.trim(),
      p_player_ids: Array.from(selectedIds),
    })
    if (error) {
      toast({ title: 'Failed to create tournament', description: error.message, variant: 'destructive' })
      setCreating(false)
      return
    }
    toast({ title: 'Tournament created! 🏆', description: 'Bracket seeded by ELO.' })
    setCreateOpen(false)
    setName('')
    setCreating(false)
    await fetchTournaments()
    const { data: t } = await supabase.from('tournaments').select('*').eq('id', tid).single()
    if (t) openTournament(t as Tournament)
  }

  async function handleReport() {
    if (!scoreMatch) return
    const s1 = parseInt(score1), s2 = parseInt(score2)
    if (isNaN(s1) || isNaN(s2) || s1 === s2) {
      toast({ title: 'Enter two different scores', variant: 'destructive' })
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
      setScoreMatch(null)
      setScore1(''); setScore2('')
      refreshBracket()
    }
    setReporting(false)
  }

  function copyShareLink(t: Tournament) {
    const url = `${window.location.origin}/tournaments/${t.share_code}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: 'Spectator link copied!', description: 'Anyone with this link can follow the bracket — no account needed.' })
  }

  const playerMap = new Map(players.map(p => [p.user_id, p]))

  if (loading) return <div className="text-center py-12 text-gray-500">Loading tournaments…</div>

  // ── Bracket detail view ─────────────────────────────────────────────────
  if (selected) {
    const winner = selected.winner_id ? playerMap.get(selected.winner_id) : null
    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" /> All tournaments
          </button>
          <Button size="sm" variant="outline" onClick={() => copyShareLink(selected)}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}
            Share with spectators
          </Button>
        </div>

        <div className="mb-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            {selected.name}
          </h2>
          {selected.status === 'completed' && winner && (
            <div className="mt-2 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <span className="text-lg">🏆</span>
              <PlayerAvatar name={winner.display_name} color={winner.avatar_color} imageUrl={winner.avatar_url} size="sm" />
              <span className="text-sm font-semibold text-amber-800">{winner.display_name} wins!</span>
            </div>
          )}
        </div>

        {bracketLoading ? (
          <div className="text-center py-12 text-gray-500">Loading bracket…</div>
        ) : (
          <TournamentBracket
            players={players}
            matches={matches}
            canReport={canReport && selected.status === 'active'}
            onReport={m => { setScoreMatch(m); setScore1(''); setScore2('') }}
          />
        )}

        {/* Score entry dialog */}
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
                  const p = row.id ? playerMap.get(row.id) : undefined
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
                <p className="text-xs text-gray-400">The result counts toward league ELO like any other match.</p>
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

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''}
        </p>
        {isAdmin && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> New tournament
          </Button>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No tournaments yet.{isAdmin ? ' Create one to get started!' : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tournaments.map(t => (
            <Card key={t.id} className="cursor-pointer hover:border-green-300 transition-colors" onClick={() => openTournament(t)}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Trophy className={`w-4 h-4 shrink-0 ${t.status === 'completed' ? 'text-amber-500' : 'text-green-600'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{t.name}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  t.status === 'active' ? 'bg-green-100 text-green-700' :
                  t.status === 'completed' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.status === 'active' ? 'In progress' : t.status === 'completed' ? 'Completed' : 'Cancelled'}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New tournament</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Name</Label>
              <Input
                id="t-name" placeholder="e.g. Summer Slam 2026"
                value={name} onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Players ({selectedIds.size} selected)</Label>
              <p className="text-xs text-gray-400 -mt-1">
                Singles, single elimination. Seeding is automatic by ELO — top seeds get byes if needed.
              </p>
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {members.map(m => {
                  const checked = selectedIds.has(m.user_id)
                  return (
                    <button
                      key={m.user_id}
                      onClick={() => togglePlayer(m.user_id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                        checked ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} imageUrl={m.profiles.avatar_url} size="sm" />
                      <span className="text-sm flex-1 truncate">{m.profiles.display_name}</span>
                      <span className="text-xs text-gray-400">{m.elo_rating}</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        checked ? 'bg-green-500 border-green-500' : 'border-gray-300'
                      }`}>
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || selectedIds.size < 2 || !name.trim()}>
              {creating ? 'Creating…' : 'Create & seed bracket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
