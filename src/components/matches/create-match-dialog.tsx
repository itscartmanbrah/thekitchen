'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { PlayerAvatar } from '@/components/player-avatar'
import { Plus, X } from 'lucide-react'
import type { LeagueMemberWithProfile, MatchFormat } from '@/types/database'

interface Props {
  leagueId: string
  onCreated: () => void
}

const formatConfig: Record<MatchFormat, { label: string; perTeam: number }> = {
  singles: { label: 'Singles (1v1)', perTeam: 1 },
  doubles: { label: 'Doubles (2v2)', perTeam: 2 },
  mixed_doubles: { label: 'Mixed Doubles (2v2)', perTeam: 2 },
  round_robin: { label: 'Round Robin', perTeam: 1 },
}

export function CreateMatchDialog({ leagueId, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<MatchFormat>('singles')
  const [team1, setTeam1] = useState<string[]>([])
  const [team2, setTeam2] = useState<string[]>([])
  const [officiatorId, setOfficiatorId] = useState('')
  const [maxPoints, setMaxPoints] = useState(11)
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')
  const [members, setMembers] = useState<LeagueMemberWithProfile[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    supabase
      .from('league_members')
      .select('*, profiles(*)')
      .eq('league_id', leagueId)
      .then(({ data }) => setMembers((data as LeagueMemberWithProfile[]) ?? []))
  }, [open, leagueId])

  const perTeam = formatConfig[format].perTeam
  const usedIds = [...team1, ...team2]
  const availableMembers = members.filter(m => !usedIds.includes(m.user_id))

  function addToTeam(team: 1 | 2, userId: string) {
    if (team === 1 && team1.length < perTeam) setTeam1(prev => [...prev, userId])
    if (team === 2 && team2.length < perTeam) setTeam2(prev => [...prev, userId])
  }

  function removeFromTeam(team: 1 | 2, userId: string) {
    if (team === 1) setTeam1(prev => prev.filter(id => id !== userId))
    else setTeam2(prev => prev.filter(id => id !== userId))
  }

  const getMember = (userId: string) => members.find(m => m.user_id === userId)

  async function handleCreate() {
    if (team1.length !== perTeam || team2.length !== perTeam) {
      toast({ title: 'Incomplete teams', description: `Each team needs ${perTeam} player(s).`, variant: 'destructive' })
      return
    }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: match, error } = await supabase
      .from('matches')
      .insert({
        league_id: leagueId,
        format,
        status: 'scheduled',
        officiator_id: officiatorId || null,
        max_points: maxPoints,
        scheduled_at: scheduledAt || null,
        notes: notes || null,
        created_by: user.id,
      } as any)
      .select()
      .single()

    if (error || !match) {
      toast({ title: 'Failed to create match', description: error?.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    const playerInserts = [
      ...team1.map(userId => {
        const m = getMember(userId)
        return { match_id: (match as any).id, user_id: userId, team: 1, elo_before: m?.elo_rating ?? 1000 }
      }),
      ...team2.map(userId => {
        const m = getMember(userId)
        return { match_id: (match as any).id, user_id: userId, team: 2, elo_before: m?.elo_rating ?? 1000 }
      }),
    ]

    await supabase.from('match_players').insert(playerInserts as any)

    toast({ title: 'Match created!' })
    setOpen(false)
    setTeam1([]); setTeam2([]); setOfficiatorId(''); setFormat('singles'); setScheduledAt(''); setNotes('')
    onCreated()
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" />
          New match
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create match</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={v => { setFormat(v as MatchFormat); setTeam1([]); setTeam2([]) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(formatConfig).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {([1, 2] as const).map(teamNum => {
              const teamPlayers = teamNum === 1 ? team1 : team2
              return (
                <div key={teamNum} className="space-y-2">
                  <Label>Team {teamNum}</Label>
                  <div className="space-y-1 min-h-[40px]">
                    {teamPlayers.map(userId => {
                      const m = getMember(userId)
                      if (!m) return null
                      return (
                        <div key={userId} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1">
                          <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} imageUrl={m.profiles.avatar_url} size="sm" />
                          <span className="text-xs flex-1 truncate">{m.profiles.display_name}</span>
                          <button onClick={() => removeFromTeam(teamNum, userId)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                    {teamPlayers.length < perTeam && (
                      <Select onValueChange={v => addToTeam(teamNum, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Add player…" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMembers.map(m => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              {m.profiles.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="space-y-2">
            <Label>Officiator (optional)</Label>
            <Select value={officiatorId || 'none'} onValueChange={v => setOfficiatorId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select officiator…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {members.map(m => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.profiles.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Max points (game to)</Label>
            <Input
              type="number"
              min={1}
              max={21}
              value={maxPoints}
              onChange={e => setMaxPoints(parseInt(e.target.value) || 11)}
              className="w-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduled-at">
              Scheduled date & time <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </Label>
            <Input
              id="scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="match-notes">
              Notes <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </Label>
            <Textarea
              id="match-notes"
              placeholder="e.g. Court 3, outdoor game, tiebreak rules…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating…' : 'Create match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
