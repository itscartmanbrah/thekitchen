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
    const maxPoints: number = match.max_points ?? 11

    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
      toast({ title: 'Invalid scores', variant: 'destructive' })
      return
    }
    if (s1 === s2) {
      toast({ title: 'Scores must differ', description: 'Ties are not allowed in pickleball.', variant: 'destructive' })
      return
    }

    const winner = Math.max(s1, s2)
    const loser  = Math.min(s1, s2)
    const diff   = winner - loser

    // Winner must reach the target score
    if (winner < maxPoints) {
      toast({
        title: 'Score too low',
        description: `The winning score must reach at least ${maxPoints}. Current winner has ${winner}.`,
        variant: 'destructive',
      })
      return
    }

    // Must win by at least 2 (pickleball rule — always)
    if (diff < 2) {
      toast({
        title: 'Must win by 2',
        description: `Scores are ${winner}–${loser}. In pickleball you must win by at least 2 points. Keep playing until someone leads by 2.`,
        variant: 'destructive',
      })
      return
    }

    // If the winner's score exceeds the target, the game went into extended play.
    // Extended play ends the moment someone leads by exactly 2 — so the loser
    // must have exactly (winner - 2). e.g. for a game to 11: 12-10, 13-11…
    // A score like 9-12 is impossible (loser can't have 9 if winner has 12).
    if (winner > maxPoints && diff !== 2) {
      toast({
        title: 'Invalid extended-play score',
        description: `If the score goes past ${maxPoints}, extended play ends the moment someone leads by exactly 2. The loser must have ${winner - 2}, not ${loser}.`,
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    // Mark the match completed with final scores
    const { error: matchError } = await supabase
      .from('matches')
      .update({
        team1_score: s1,
        team2_score: s2,
        status: 'completed',
        completed_at: new Date().toISOString(),
      } as any)
      .eq('id', match.id)

    if (matchError) {
      toast({ title: 'Failed to submit score', description: matchError.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    // Process ELO server-side via security definer RPC — works for any role
    const { error: rpcError } = await supabase.rpc('process_match_result', {
      p_match_id: match.id,
    })

    if (rpcError) {
      // Revert match back to scheduled so it can be resubmitted
      await supabase
        .from('matches')
        .update({ status: 'scheduled', team1_score: null, team2_score: null, completed_at: null } as any)
        .eq('id', match.id)
      toast({ title: 'Failed to submit score', description: 'ELO calculation error — please try again. ' + rpcError.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    toast({ title: 'Score submitted!', description: 'ELO ratings updated.' })
    setOpen(false)
    setScore1('')
    setScore2('')
    onSubmitted()
    setLoading(false)
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
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            Playing to <strong>{match.max_points ?? 11}</strong> — must win by at least 2 points.
          </div>
          <div className="grid grid-cols-2 gap-3 xs:gap-4">
            <div className="space-y-2">
              <div className="flex flex-col items-center gap-1 mb-1">
                {team1.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <PlayerAvatar name={p.profiles.display_name} color={p.profiles.avatar_color} imageUrl={p.profiles.avatar_url} size="sm" />
                    <span className="text-sm font-medium text-gray-700 truncate">{p.profiles.display_name}</span>
                  </div>
                ))}
              </div>
              <Label className="text-center block">Team 1 score</Label>
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
              <div className="flex flex-col items-center gap-1 mb-1">
                {team2.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <PlayerAvatar name={p.profiles.display_name} color={p.profiles.avatar_color} imageUrl={p.profiles.avatar_url} size="sm" />
                    <span className="text-sm font-medium text-gray-700 truncate">{p.profiles.display_name}</span>
                  </div>
                ))}
              </div>
              <Label className="text-center block">Team 2 score</Label>
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
