'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/player-avatar'
import { formatElo } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { MoreHorizontal } from 'lucide-react'
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
  const [loading, setLoading] = useState(true)
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

  useEffect(() => { fetchMembers() }, [leagueId])

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

  if (loading) return <div className="text-center py-12 text-gray-500">Loading members…</div>

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''}</p>
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
                  <span className="text-xs text-gray-500 hidden sm:block">{m.profiles.email}</span>
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
                        className="text-red-600"
                        onClick={() => removeMember(m.id, m.user_id)}
                      >
                        Remove from league
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
    </div>
  )
}
