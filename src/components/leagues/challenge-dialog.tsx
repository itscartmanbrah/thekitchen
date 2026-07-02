'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { Swords } from 'lucide-react'

const FORMAT_OPTIONS = [
  { value: 'singles',       label: 'Singles' },
  { value: 'doubles',       label: 'Doubles' },
  { value: 'mixed_doubles', label: 'Mixed' },
]

interface Member {
  user_id: string
  role: string
  profiles: { display_name: string; avatar_color: string; avatar_url: string | null }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  leagueId: string
  challengedId: string
  challengedName: string
  currentUserId: string
  members: Member[]
}

export function ChallengeDialog({
  open, onOpenChange,
  leagueId, challengedId, challengedName,
  currentUserId, members,
}: Props) {
  const [format, setFormat]           = useState('singles')
  const [officiatorId, setOfficiatorId] = useState('')
  const [proposedAt, setProposedAt]   = useState('')
  const [message, setMessage]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [conflict, setConflict]       = useState<{ challenger: boolean; challenged: boolean }>({ challenger: false, challenged: false })
  const { toast } = useToast()
  const supabase = createClient()

  // Check both players for scheduling conflicts whenever the proposed time changes
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => {
      supabase
        .rpc('get_conflicting_players', {
          p_league_id: leagueId,
          p_user_ids: [currentUserId, challengedId],
          p_proposed_at: proposedAt ? new Date(proposedAt).toISOString() : null,
        })
        .then(({ data }) => {
          const ids = new Set((data ?? []).map((r: any) => r.user_id))
          setConflict({ challenger: ids.has(currentUserId), challenged: ids.has(challengedId) })
        })
    }, 300)
    return () => clearTimeout(handle)
  }, [open, proposedAt, currentUserId, challengedId, leagueId])

  const hasConflict = conflict.challenger || conflict.challenged

  // Officiators and admins only, excluding both players
  const eligible = members.filter(m =>
    m.user_id !== currentUserId &&
    m.user_id !== challengedId &&
    ['head_admin', 'admin', 'officiator'].includes(m.role)
  )

  function reset() {
    setFormat('singles')
    setOfficiatorId('')
    setProposedAt('')
    setMessage('')
  }

  async function handleSubmit() {
    if (!officiatorId) {
      toast({ title: 'Select an officiator first', variant: 'destructive' })
      return
    }
    if (hasConflict) {
      toast({ title: 'Scheduling conflict', description: 'One of the players is unavailable at this time.', variant: 'destructive' })
      return
    }
    setLoading(true)

    // Fetch display names for notification body
    const [{ data: myProfile }, { data: theirProfile }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', currentUserId).single(),
      supabase.from('profiles').select('display_name').eq('id', challengedId).single(),
    ])
    const myName    = (myProfile as any)?.display_name ?? 'Someone'
    const theirName = (theirProfile as any)?.display_name ?? challengedName

    // Insert challenge
    const { data: challenge, error } = await supabase
      .from('challenges')
      .insert({
        league_id:     leagueId,
        challenger_id: currentUserId,
        challenged_id: challengedId,
        officiator_id: officiatorId,
        format,
        proposed_at: proposedAt || null,
        message:     message.trim() || null,
        status:      'pending_officiator',
      } as any)
      .select('id')
      .single()

    if (error) {
      toast({ title: 'Failed to send challenge', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    // Notify the officiator
    await supabase.from('notifications').insert({
      user_id: officiatorId,
      type:    'challenge_officiate',
      title:   '⚔️ Officiating request',
      body:    `${myName} has challenged ${theirName} to a ${FORMAT_OPTIONS.find(f => f.value === format)?.label ?? format} match and wants you to officiate.`,
      data: {
        challenge_id:   challenge.id,
        league_id:      leagueId,
        challenger_id:  currentUserId,
        challenger_name: myName,
        challenged_id:  challengedId,
        challenged_name: theirName,
        format,
      },
    } as any)

    toast({
      title: 'Challenge sent!',
      description: `Waiting for the officiator to accept before ${theirName} is notified.`,
    })
    setLoading(false)
    onOpenChange(false)
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-green-400" />
            Challenge {challengedName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Format */}
          <div className="space-y-1.5">
            <Label>Format</Label>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${
                    format === opt.value
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-300 font-medium'
                      : 'border-border text-muted-foreground hover:border-border'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Officiator picker */}
          <div className="space-y-1.5">
            <Label>
              Officiator <span className="text-red-600 dark:text-red-400">*</span>
            </Label>
            {eligible.length === 0 ? (
              <p className="text-sm text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                No eligible officiators in this league. An admin or officiator (other than you and your opponent) is required.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {eligible.map(m => (
                  <button
                    key={m.user_id}
                    onClick={() => setOfficiatorId(m.user_id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                      officiatorId === m.user_id
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-border hover:border-border'
                    }`}
                  >
                    <PlayerAvatar
                      name={m.profiles.display_name}
                      color={m.profiles.avatar_color}
                      imageUrl={m.profiles.avatar_url}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{m.profiles.display_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{m.role.replace('_', ' ')}</p>
                    </div>
                    {officiatorId === m.user_id && (
                      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                        <div className="w-2 h-2 rounded-full bg-card" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground/80">
              The officiator must accept before your opponent is notified.
            </p>
          </div>

          {/* Proposed time */}
          <div className="space-y-1.5">
            <Label>Proposed time <span className="text-muted-foreground/80 font-normal">(optional)</span></Label>
            <input
              type="datetime-local"
              value={proposedAt}
              onChange={e => setProposedAt(e.target.value)}
              className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300 bg-card"
            />
            {hasConflict && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                {conflict.challenger && conflict.challenged
                  ? 'You and your opponent both'
                  : conflict.challenger ? 'You' : `${challengedName}`}
                {' '}already {hasConflict && (conflict.challenger && conflict.challenged ? 'have' : 'has')} a conflicting scheduled match
                {proposedAt
                  ? ' — matches must be at least 30 minutes apart.'
                  : ' — and a match without a set time blocks any other match. Try proposing a specific time at least 30 minutes from your other match.'}
              </p>
            )}
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label>Message <span className="text-muted-foreground/80 font-normal">(optional)</span></Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Any message for your opponent…"
              rows={2}
              className="text-sm resize-none"
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset() }}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !officiatorId || eligible.length === 0 || hasConflict}
          >
            {loading ? 'Sending…' : 'Send challenge ⚔️'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
