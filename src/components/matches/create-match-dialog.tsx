'use client'

import { useEffect, useRef, useState } from 'react'
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
import { Plus, Search, X } from 'lucide-react'
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

// ── Inline player search / autocomplete ──────────────────────────────────────
function PlayerSearch({
  members,
  onSelect,
  conflictedIds,
}: {
  members: LeagueMemberWithProfile[]
  onSelect: (userId: string) => void
  conflictedIds?: Set<string>
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const filtered = query.trim()
    ? members.filter(m =>
        m.profiles.display_name.toLowerCase().includes(query.toLowerCase())
      )
    : members

  function pick(member: LeagueMemberWithProfile) {
    if (conflictedIds?.has(member.user_id)) {
      toast({
        title: `${member.profiles.display_name} is unavailable`,
        description: 'This player already has a conflicting scheduled match (matches without a time block any other match; scheduled matches must be at least 30 minutes apart).',
        variant: 'destructive',
      })
      return
    }
    onSelect(member.user_id)
    setQuery('')
    setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-2 text-xs focus-within:ring-1 focus-within:ring-ring">
        <Search className="w-3 h-3 text-gray-400 shrink-0" />
        <input
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-xs"
          placeholder="Search player…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="text-gray-400 hover:text-gray-600">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-white shadow-md text-xs">
          {filtered.map(m => (
            <li key={m.user_id}>
              <button
                type="button"
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-left ${
                  conflictedIds?.has(m.user_id) ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : 'hover:bg-gray-50'
                }`}
                onMouseDown={e => { e.preventDefault(); pick(m) }}
              >
                <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} imageUrl={m.profiles.avatar_url} size="sm" />
                <span className="truncate">{m.profiles.display_name}</span>
                {conflictedIds?.has(m.user_id) && (
                  <span className="ml-auto text-[10px] text-red-500 font-medium shrink-0">Unavailable</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-md px-3 py-2 text-xs text-gray-400">
          No players found
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [conflictedIds, setConflictedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    supabase
      .from('league_members')
      .select('*, profiles(*), leagues(name)')
      .eq('league_id', leagueId)
      .then(({ data }) => setMembers((data as LeagueMemberWithProfile[]) ?? []))
  }, [open, leagueId])

  // Re-check scheduling conflicts whenever the dialog opens, the player pool
  // changes, or the proposed time changes.
  useEffect(() => {
    if (!open || members.length === 0) return
    const handle = setTimeout(() => {
      supabase
        .rpc('get_conflicting_players', {
          p_league_id: leagueId,
          p_user_ids: members.map(m => m.user_id),
          p_proposed_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        })
        .then(({ data }) => {
          setConflictedIds(new Set((data ?? []).map((r: any) => r.user_id)))
        })
    }, 300)
    return () => clearTimeout(handle)
  }, [open, members, scheduledAt, leagueId])

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
    const conflicted = [...team1, ...team2].filter(id => conflictedIds.has(id))
    if (conflicted.length > 0) {
      const names = conflicted.map(id => getMember(id)?.profiles.display_name).filter(Boolean).join(', ')
      toast({
        title: 'Scheduling conflict',
        description: `${names} already ${conflicted.length > 1 ? 'have' : 'has'} a conflicting scheduled match. Remove them or change the time.`,
        variant: 'destructive',
      })
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

    // Send notifications if a date/time was set
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
      const league = members[0] // we have league context from members
      const leagueName = (league as any)?.leagues?.name ?? 'your league'

      // Notify all players
      const playerNotifications = [...team1, ...team2].map(userId => ({
        user_id: userId,
        type: 'match_scheduled',
        title: '📅 Match scheduled',
        body: `You have a ${formatConfig[format].label} match on ${scheduledDate}${notes ? ` — "${notes}"` : ''}.`,
        data: { match_id: (match as any).id, league_id: leagueId },
      }))

      // Notify officiator separately
      if (officiatorId && !usedIds.includes(officiatorId)) {
        playerNotifications.push({
          user_id: officiatorId,
          type: 'match_scheduled',
          title: '🏅 You are officiating a match',
          body: `You have been assigned to officiate a ${formatConfig[format].label} match on ${scheduledDate} in ${leagueName}.`,
          data: { match_id: (match as any).id, league_id: leagueId },
        })
      }

      await supabase.from('notifications').insert(playerNotifications as any)
    }

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
                      <PlayerSearch
                        members={availableMembers}
                        onSelect={v => addToTeam(teamNum, v)}
                        conflictedIds={conflictedIds}
                      />
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
