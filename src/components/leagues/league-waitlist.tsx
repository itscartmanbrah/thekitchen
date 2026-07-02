'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { UserCheck, UserX, Clock } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { LeagueRole } from '@/types/database'

interface PendingMember {
  id: string
  user_id: string
  joined_at: string
  profiles: { display_name: string; avatar_color: string; avatar_url: string | null; email: string }
}

const roleLabels: Record<string, string> = {
  player: 'Player',
  officiator: 'Officiator',
  admin: 'Admin',
}

export function LeagueWaitlist({ leagueId }: { leagueId: string }) {
  const [pending, setPending] = useState<PendingMember[]>([])
  const [roles, setRoles] = useState<Record<string, LeagueRole>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const { toast } = useToast()
  const supabase = createClient()

  async function fetchPending() {
    const { data } = await supabase
      .from('league_members')
      .select('*, profiles(*)')
      .eq('league_id', leagueId)
      .eq('status', 'pending')
      .order('joined_at', { ascending: true })
    const members = (data as PendingMember[]) ?? []
    setPending(members)
    // Default role for each pending member
    const defaultRoles: Record<string, LeagueRole> = {}
    members.forEach(m => { defaultRoles[m.id] = 'player' })
    setRoles(prev => ({ ...defaultRoles, ...prev }))
  }

  useEffect(() => { fetchPending() }, [leagueId])

  async function approve(member: PendingMember) {
    const role = roles[member.id] ?? 'player'
    setLoading(prev => ({ ...prev, [member.id]: true }))

    const { error } = await supabase
      .from('league_members')
      .update({ status: 'active', role } as any)
      .eq('id', member.id)

    if (error) {
      toast({ title: 'Failed to approve', description: error.message, variant: 'destructive' })
      setLoading(prev => ({ ...prev, [member.id]: false }))
      return
    }

    // Notify the approved user
    const { data: leagueData } = await supabase.from('leagues').select('name').eq('id', leagueId).single()
    await supabase.from('notifications').insert({
      user_id: member.user_id,
      type: 'join_approved',
      title: '✅ Join request approved!',
      body: `You have been approved to join ${(leagueData as any)?.name ?? 'the league'} as a ${roleLabels[role] ?? role}.`,
      data: { league_id: leagueId },
    } as any)

    toast({ title: `${member.profiles.display_name} approved as ${roleLabels[role]}!` })
    fetchPending()
    setLoading(prev => ({ ...prev, [member.id]: false }))
  }

  async function decline(member: PendingMember) {
    setLoading(prev => ({ ...prev, [member.id]: true }))

    const { error } = await supabase.from('league_members').delete().eq('id', member.id)
    if (error) {
      toast({ title: 'Failed to decline', description: error.message, variant: 'destructive' })
      setLoading(prev => ({ ...prev, [member.id]: false }))
      return
    }

    // Notify the declined user
    const { data: leagueData } = await supabase.from('leagues').select('name').eq('id', leagueId).single()
    await supabase.from('notifications').insert({
      user_id: member.user_id,
      type: 'join_declined',
      title: '❌ Join request declined',
      body: `Your request to join ${(leagueData as any)?.name ?? 'the league'} was not approved. Contact the admin for more info.`,
      data: { league_id: leagueId },
    } as any)

    toast({ title: `${member.profiles.display_name} declined` })
    fetchPending()
    setLoading(prev => ({ ...prev, [member.id]: false }))
  }

  if (pending.length === 0) return (
    <div className="text-center py-8 text-muted-foreground/80 text-sm">
      <Clock className="w-6 h-6 mx-auto mb-1 text-muted-foreground/50" />
      No pending requests
    </div>
  )

  return (
    <div className="space-y-3">
      {pending.map(m => (
        <Card key={m.id}>
          <CardContent className="py-3 px-4 space-y-3">
            {/* Player info */}
            <div className="flex items-center gap-3">
              <PlayerAvatar
                name={m.profiles.display_name}
                color={m.profiles.avatar_color}
                imageUrl={m.profiles.avatar_url}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{m.profiles.display_name}</p>
                <p className="text-xs text-muted-foreground/80">{m.profiles.email}</p>
              </div>
              <p className="text-xs text-muted-foreground/80 shrink-0">
                {new Date(m.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>

            {/* Role selector + action buttons */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={roles[m.id] ?? 'player'}
                  onValueChange={v => setRoles(prev => ({ ...prev, [m.id]: v as LeagueRole }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Assign role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player">Player</SelectItem>
                    <SelectItem value="officiator">Officiator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => approve(m)}
                disabled={loading[m.id]}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => decline(m)}
                disabled={loading[m.id]}
              >
                <UserX className="w-3.5 h-3.5" />
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
