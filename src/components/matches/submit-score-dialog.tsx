'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { PlayerAvatar } from '@/components/player-avatar'
import { ClipboardCheck } from 'lucide-react'

interface Props {
  match: any
  onSubmitted: () => void
}

export function SubmitScoreDialog({ match, onSubmitted }: Props) {
  const [open, setOpen] = useState(false)
  const [score1, setScore1] = useState('')
  const [score2, setScore2] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const team1 = match.match_players?.filter((p: any) => p.team === 1) ?? []
  const team2 = match.match_players?.filter((p: any) => p.team === 2) ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const s1 = parseInt(score1)
    const s2 = parseInt(score2)
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
      toast({ title: 'Invalid scores', variant: 'destructive' })
      return
    }
    if (s1 === s2) {
      toast({ title: 'Scores must differ', description: 'Ties are not allowed.', variant: 'destructive' })
      return
    }
    setLoading(true)

    const { error } = await supabase
      .from('matches')
      .update({
        team1_score: s1,
        team2_score: s2,
        status: 'completed',
        completed_at: new Date().toISOString(),
      } as any)
      .eq('id', match.id)

    if (error) {
      toast({ title: 'Failed to submit score', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    await processElo(s1, s2)

    toast({ title: 'Score submitted!', description: 'ELO ratings updated.' })
    setOpen(false)
    onSubmitted()
    setLoading(false)
  }

  async function processElo(s1: number, s2: number) {
    const K = 32
    const maxPts = match.max_points ?? 11
    const pointDiff = Math.abs(s1 - s2)
    const rawMult = 1 + (pointDiff / maxPts) * 0.5
    const marginMult = Math.min(1.5, Math.max(1.0, rawMult))

    const team1Elos: number[] = team1.map((p: any) => p.elo_before)
    const team2Elos: number[] = team2.map((p: any) => p.elo_before)
    const avgElo1 = team1Elos.reduce((a, b) => a + b, 0) / team1Elos.length
    const avgElo2 = team2Elos.reduce((a, b) => a + b, 0) / team2Elos.length

    const E1 = 1 / (1 + Math.pow(10, (avgElo2 - avgElo1) / 400))
    const E2 = 1 - E1
    const S1 = s1 > s2 ? 1.0 : 0.0
    const S2 = 1.0 - S1

    const delta1 = Math.round(K * marginMult * (S1 - E1))
    const delta2 = Math.round(K * marginMult * (S2 - E2))

    const allUpdates: { player: any; delta: number; won: boolean }[] = [
      ...team1.map((p: any) => ({ player: p, delta: delta1, won: s1 > s2 })),
      ...team2.map((p: any) => ({ player: p, delta: delta2, won: s2 > s1 })),
    ]

    for (const { player, delta, won } of allUpdates) {
      const newElo = Math.max(100, player.elo_before + delta)

      await supabase.from('match_players').update({ elo_after: newElo } as any).eq('id', player.id)

      const { data: member } = await supabase
        .from('league_members')
        .select('wins, losses')
        .eq('league_id', match.league_id)
        .eq('user_id', player.user_id)
        .single()

      if (member) {
        await supabase.from('league_members').update({
          elo_rating: newElo,
          wins: won ? (member as any).wins + 1 : (member as any).wins,
          losses: !won ? (member as any).losses + 1 : (member as any).losses,
        } as any)
          .eq('league_id', match.league_id)
          .eq('user_id', player.user_id)
      }

      await supabase.from('point_transactions').insert({
        match_id: match.id,
        user_id: player.user_id,
        league_id: match.league_id,
        points_before: player.elo_before,
        points_after: newElo,
        delta,
      } as any)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ClipboardCheck className="w-3.5 h-3.5" />
          Score
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Submit score</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                {team1.map((p: any) => (
                  <PlayerAvatar key={p.id} name={p.profiles.display_name} color={p.profiles.avatar_color} size="sm" />
                ))}
              </div>
              <Label>Team 1 score</Label>
              <Input
                type="number"
                min={0}
                max={99}
                value={score1}
                onChange={e => setScore1(e.target.value)}
                className="text-2xl font-bold text-center h-14"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                {team2.map((p: any) => (
                  <PlayerAvatar key={p.id} name={p.profiles.display_name} color={p.profiles.avatar_color} size="sm" />
                ))}
              </div>
              <Label>Team 2 score</Label>
              <Input
                type="number"
                min={0}
                max={99}
                value={score2}
                onChange={e => setScore2(e.target.value)}
                className="text-2xl font-bold text-center h-14"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Submitting…' : 'Confirm result'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
