'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Trophy, Calendar, Swords, ChevronRight } from 'lucide-react'

interface Season {
  id: string
  name: string
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
}

interface Props {
  leagueId: string
  currentUserId: string
}

const RESET_OPTIONS = [
  {
    value: 'soft',
    label: 'Soft reset',
    description: 'Pull everyone 50% toward 1200 — rewards past performance while compressing the gap.',
    example: '1400 → 1300  ·  800 → 900  ·  1200 stays',
  },
  {
    value: 'full',
    label: 'Full reset',
    description: 'Everyone starts fresh at 1000. Pure competition.',
    example: 'All players → 1000',
  },
  {
    value: 'none',
    label: 'No reset',
    description: 'ELO carries over. Seasons are record-keeping periods only.',
    example: 'ELO unchanged',
  },
]

export function LeagueSeasonManager({ leagueId, currentUserId }: Props) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [matchCount, setMatchCount] = useState(0)

  // Start season dialog
  const [showStart, setShowStart] = useState(false)
  const [seasonName, setSeasonName] = useState('')
  const [starting, setStarting] = useState(false)

  // End season dialog
  const [showEnd, setShowEnd] = useState(false)
  const [resetType, setResetType] = useState<'soft' | 'full' | 'none'>('soft')
  const [ending, setEnding] = useState(false)

  const { toast } = useToast()
  const supabase = createClient()

  const activeSeason = seasons.find(s => s.status === 'active') ?? null
  const endedSeasons = seasons.filter(s => s.status === 'ended')

  async function fetchSeasons() {
    const [{ data: s }, { count }] = await Promise.all([
      supabase
        .from('seasons')
        .select('*')
        .eq('league_id', leagueId)
        .order('started_at', { ascending: false }),
      supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', leagueId)
        .eq('status', 'completed')
        .then(r => r),
    ])
    setSeasons((s as Season[]) ?? [])
    setMatchCount(count ?? 0)
    setLoading(false)
  }

  useEffect(() => { fetchSeasons() }, [leagueId])

  async function startSeason() {
    if (!seasonName.trim()) return
    setStarting(true)

    const { error } = await supabase.from('seasons').insert({
      league_id: leagueId,
      name: seasonName.trim(),
      status: 'active',
      created_by: currentUserId,
    } as any)

    if (error) {
      toast({ title: 'Failed to start season', description: error.message, variant: 'destructive' })
      setStarting(false)
      return
    }

    toast({ title: `${seasonName.trim()} started!` })
    setShowStart(false)
    setSeasonName('')
    fetchSeasons()
    setStarting(false)
  }

  async function endSeason() {
    if (!activeSeason) return
    setEnding(true)

    // 1. Snapshot current standings into season_results
    const { data: members } = await supabase
      .from('league_members')
      .select('user_id, elo_rating, wins, losses')
      .eq('league_id', leagueId)
      .eq('status', 'active')
      .order('elo_rating', { ascending: false })

    if (members && members.length > 0) {
      const snapshots = members.map((m: any, i: number) => ({
        season_id: activeSeason.id,
        league_id: leagueId,
        user_id: m.user_id,
        final_elo: m.elo_rating,
        final_rank: i + 1,
        wins: m.wins,
        losses: m.losses,
      }))
      await supabase.from('season_results').insert(snapshots as any)
    }

    // 2. Apply ELO reset
    if (resetType !== 'none' && members) {
      for (const m of members as any[]) {
        let newElo: number
        if (resetType === 'full') {
          newElo = 1000
        } else {
          // Soft reset: pull 50% toward 1200
          newElo = Math.round(m.elo_rating + (1200 - m.elo_rating) * 0.5)
        }
        await supabase
          .from('league_members')
          .update({ elo_rating: newElo, wins: 0, losses: 0 } as any)
          .eq('league_id', leagueId)
          .eq('user_id', m.user_id)
      }
    }

    // 3. Mark season as ended
    await supabase
      .from('seasons')
      .update({ status: 'ended', ended_at: new Date().toISOString() } as any)
      .eq('id', activeSeason.id)

    toast({ title: `${activeSeason.name} ended!`, description: 'Standings saved. ELO has been reset.' })
    setShowEnd(false)
    fetchSeasons()
    setEnding(false)
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return null

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground/90">Season management</h3>
        {!activeSeason && (
          <Button size="sm" variant="outline" onClick={() => {
            setSeasonName(`Season ${seasons.length + 1}`)
            setShowStart(true)
          }}>
            <Trophy className="w-3.5 h-3.5 mr-1.5" />
            Start season
          </Button>
        )}
      </div>

      {/* Active season card */}
      {activeSeason ? (
        <Card className="border-green-500/25 bg-green-50/40">
          <CardContent className="py-4 px-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground">{activeSeason.name}</span>
                  <span className="text-xs bg-green-500/15 text-green-700 dark:text-green-300 font-medium px-2 py-0.5 rounded-full">Active</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Started {fmt(activeSeason.started_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Swords className="w-3 h-3" />
                    {matchCount} completed match{matchCount !== 1 ? 'es' : ''}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 dark:text-red-400 border-red-500/25 hover:bg-red-500/10 shrink-0"
                onClick={() => setShowEnd(true)}
              >
                End season
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-muted-foreground/80 text-sm">
            <Trophy className="w-6 h-6 mx-auto mb-1 text-muted-foreground/50" />
            No active season. Start one to begin tracking season standings.
          </CardContent>
        </Card>
      )}

      {/* Past seasons */}
      {endedSeasons.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider mb-2">Past seasons</p>
          <div className="space-y-2">
            {endedSeasons.map(s => (
              <Card key={s.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground/90">{s.name}</p>
                      <p className="text-xs text-muted-foreground/80">
                        {fmt(s.started_at)} → {s.ended_at ? fmt(s.ended_at) : '—'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Start season dialog ── */}
      <Dialog open={showStart} onOpenChange={setShowStart}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Start a new season</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Season name</Label>
              <Input
                value={seasonName}
                onChange={e => setSeasonName(e.target.value)}
                placeholder="e.g. Season 1, Summer 2026…"
              />
            </div>
            <p className="text-xs text-muted-foreground/80">
              All future matches will be tagged to this season. The leaderboard will show a season selector once you have at least one ended season.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStart(false)}>Cancel</Button>
            <Button onClick={startSeason} disabled={starting || !seasonName.trim()}>
              {starting ? 'Starting…' : 'Start season'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── End season dialog ── */}
      <Dialog open={showEnd} onOpenChange={setShowEnd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End {activeSeason?.name}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current standings will be saved as the final results for this season. Choose what happens to player ELO ratings.
            </p>
            <div className="space-y-2">
              {RESET_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setResetType(opt.value as any)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    resetType === opt.value
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-border hover:border-border'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      resetType === opt.value ? 'border-green-500' : 'border-border'
                    }`}>
                      {resetType === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                    </div>
                    <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-5">{opt.description}</p>
                  <p className="text-xs text-muted-foreground/80 ml-5 mt-0.5 font-mono">{opt.example}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
              ⚠️ This cannot be undone. Make sure all match scores have been submitted before ending the season.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnd(false)}>Cancel</Button>
            <Button
              onClick={endSeason}
              disabled={ending}
              className="bg-red-600 hover:bg-red-700"
            >
              {ending ? 'Ending season…' : 'End season & save results'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
