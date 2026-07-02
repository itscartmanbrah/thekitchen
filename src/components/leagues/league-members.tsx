'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtime } from '@/lib/use-realtime'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { PlayerAvatar } from '@/components/player-avatar'
import { ChallengeDialog } from '@/components/leagues/challenge-dialog'
import { formatElo } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { MoreHorizontal, Swords, ShieldBan, ShieldCheck } from 'lucide-react'
import { InvitePlayerDialog } from '@/components/leagues/invite-player-dialog'
import type { LeagueMemberWithProfile, LeagueRole } from '@/types/database'

interface Props {
  leagueId: string
  currentUserId: string
  isAdmin: boolean
  isHeadAdmin: boolean
}

const roleLabels: Record<string, string> = {
  head_admin: 'Head Admin',
  admin: 'Admin',
  officiator: 'Officiator',
  player: 'Player',
}

const roleOrder: Record<string, number> = { head_admin: 0, admin: 1, officiator: 2, player: 3 }

export function LeagueMembers({ leagueId, currentUserId, isAdmin, isHeadAdmin }: Props) {
  const [members, setMembers] = useState<LeagueMemberWithProfile[]>([])
  const [bannedMembers, setBannedMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [challengeTarget, setChallengeTarget] = useState<{ id: string; name: string } | null>(null)
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banLoading, setBanLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  async function fetchMembers() {
    const { data } = await supabase
      .from('league_members')
      .select('*, profiles(*)')
      .eq('league_id', leagueId)
      .eq('status', 'active')
      .order('elo_rating', { ascending: false })
    const sorted = [...(data ?? [])].sort((a, b) => roleOrder[a.role] - roleOrder[b.role])
    setMembers(sorted as LeagueMemberWithProfile[])
    setLoading(false)
  }

  async function fetchBanned() {
    if (!isAdmin) return
    const { data } = await supabase
      .from('league_members')
      .select('id, user_id, ban_reason, banned_at, profiles(display_name, avatar_color, avatar_url)')
      .eq('league_id', leagueId)
      .eq('status', 'banned')
      .order('banned_at', { ascending: false })
    setBannedMembers(data ?? [])
  }

  useEffect(() => { fetchMembers(); fetchBanned() }, [leagueId, isAdmin])

  // Live: refresh the roster when membership changes (joins, role/status edits).
  useRealtime(`members:${leagueId}`, [
    { table: 'league_members', filter: `league_id=eq.${leagueId}` },
  ], () => { fetchMembers(); if (isAdmin) fetchBanned() }, [leagueId, isAdmin])

  async function confirmBan() {
    if (!banTarget) return
    setBanLoading(true)
    const { error } = await supabase.rpc('ban_league_member', {
      p_member_id: banTarget.id,
      p_reason: banReason.trim() || null,
    })
    if (error) {
      toast({ title: 'Failed to ban member', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: `${banTarget.name} has been banned` })
      setBanTarget(null)
      setBanReason('')
      fetchMembers()
      fetchBanned()
    }
    setBanLoading(false)
  }

  async function unbanMember(memberId: string, name: string) {
    const { error } = await supabase.rpc('unban_league_member', { p_member_id: memberId })
    if (error) {
      toast({ title: 'Failed to unban member', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: `${name} has been unbanned` })
      fetchMembers()
      fetchBanned()
    }
  }

  async function changeRole(memberId: string, userId: string, newRole: LeagueRole) {
    if (userId === currentUserId) return
    const { error } = await supabase
      .from('league_members')
      .update({ role: newRole } as any)
      .eq('id', memberId)
    if (error) {
      toast({ title: 'Failed to update role', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Role updated' })
      fetchMembers()
    }
  }

  async function removeMember(memberId: string, userId: string) {
    if (userId === currentUserId) return
    const { error } = await supabase
      .from('league_members')
      .delete()
      .eq('id', memberId)
    if (error) {
      toast({ title: 'Failed to remove member', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Member removed' })
      fetchMembers()
    }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading members…</div>

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          <InvitePlayerDialog leagueId={leagueId} onInvited={fetchMembers} />
        </div>
      )}
      <div className="space-y-2">
      {members.map(m => {
        const isMe = m.user_id === currentUserId
        const canEdit = isAdmin && !isMe && m.role !== 'head_admin'

        return (
          <Card key={m.id}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} imageUrl={m.profiles.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{m.profiles.display_name}</span>
                    {isMe && <Badge variant="outline" className="text-xs py-0">You</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:block">{m.profiles.email}</span>
                  <Badge variant={m.role === 'head_admin' ? 'default' : m.role === 'admin' ? 'secondary' : 'outline'} className="text-xs sm:hidden mt-0.5">
                    {roleLabels[m.role] ?? m.role}
                  </Badge>
                </div>
                <Badge variant={m.role === 'head_admin' ? 'default' : m.role === 'admin' ? 'secondary' : 'outline'} className="text-xs hidden sm:inline-flex">
                  {roleLabels[m.role] ?? m.role}
                </Badge>
                <div className="text-sm font-medium text-right shrink-0">
                  {formatElo(m.elo_rating)}
                </div>
                {!isMe && (
                  <button
                    onClick={() => setChallengeTarget({ id: m.user_id, name: m.profiles.display_name })}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-green-400 hover:text-green-300 hover:bg-green-500/20 transition-colors shrink-0"
                  >
                    <Swords className="w-3 h-3" />
                    Challenge
                  </button>
                )}
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isHeadAdmin && (
                        <>
                          {m.role !== 'admin' && (
                            <DropdownMenuItem onClick={() => changeRole(m.id, m.user_id, 'admin')}>
                              Make Admin
                            </DropdownMenuItem>
                          )}
                          {m.role !== 'officiator' && (
                            <DropdownMenuItem onClick={() => changeRole(m.id, m.user_id, 'officiator')}>
                              Make Officiator
                            </DropdownMenuItem>
                          )}
                          {m.role !== 'player' && (
                            <DropdownMenuItem onClick={() => changeRole(m.id, m.user_id, 'player')}>
                              Make Player
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      <DropdownMenuItem
                        className="text-red-400"
                        onClick={() => removeMember(m.id, m.user_id)}
                      >
                        Remove from league
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-300"
                        onClick={() => { setBanTarget({ id: m.id, name: m.profiles.display_name }); setBanReason('') }}
                      >
                        <ShieldBan className="w-4 h-4 mr-2" />
                        Ban from league
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
      </div>

      {/* Banned members (admins only) */}
      {isAdmin && bannedMembers.length > 0 && (
        <div className="pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <ShieldBan className="w-3.5 h-3.5" />
            Banned ({bannedMembers.length})
          </p>
          <div className="space-y-2">
            {bannedMembers.map(b => (
              <Card key={b.id} className="border-red-100 bg-red-50/40">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar name={b.profiles.display_name} color={b.profiles.avatar_color} imageUrl={b.profiles.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm truncate block">{b.profiles.display_name}</span>
                      {b.ban_reason && (
                        <span className="text-xs text-muted-foreground italic truncate block">&ldquo;{b.ban_reason}&rdquo;</span>
                      )}
                      {b.banned_at && (
                        <span className="text-xs text-muted-foreground/80">
                          Banned {new Date(b.banned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => unbanMember(b.id, b.profiles.display_name)}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-green-400 hover:text-green-300 hover:bg-green-500/20 transition-colors shrink-0"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      Unban
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Ban confirmation dialog */}
      <Dialog open={!!banTarget} onOpenChange={v => { if (!v) { setBanTarget(null); setBanReason('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-300">
              <ShieldBan className="w-4 h-4" />
              Ban {banTarget?.name}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              They will be removed from the leaderboard and matches, and won&apos;t be able to rejoin this league while banned.
            </p>
            <Textarea
              placeholder="Reason for ban (optional, but recommended)…"
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBanTarget(null); setBanReason('') }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmBan}
              disabled={banLoading}
            >
              {banLoading ? 'Banning…' : 'Ban member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {challengeTarget && (
        <ChallengeDialog
          open={!!challengeTarget}
          onOpenChange={v => { if (!v) setChallengeTarget(null) }}
          leagueId={leagueId}
          challengedId={challengeTarget.id}
          challengedName={challengeTarget.name}
          currentUserId={currentUserId}
          members={members as any}
        />
      )}
    </div>
  )
}
