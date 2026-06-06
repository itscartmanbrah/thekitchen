'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { UserCheck, UserX, Clock } from 'lucide-react'

interface PendingMember {
  id: string; user_id: string; joined_at: string
  profiles: { display_name: string; avatar_color: string; email: string }
}

export function LeagueWaitlist({ leagueId }: { leagueId: string }) {
  const [pending, setPending] = useState<PendingMember[]>([])
  const { toast } = useToast()
  const supabase = createClient()

  async function fetch() {
    const { data } = await supabase
      .from('league_members')
      .select('*, profiles(*)')
      .eq('league_id', leagueId)
      .eq('status', 'pending')
      .order('joined_at', { ascending: true })
    setPending((data as PendingMember[]) ?? [])
  }

  useEffect(() => { fetch() }, [leagueId])

  async function approve(memberId: string, name: string) {
    const { error } = await supabase
      .from('league_members')
      .update({ status: 'active' } as any)
      .eq('id', memberId)
    if (error) {
      toast({ title: 'Failed to approve', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: `${name} approved!` }); fetch()
    }
  }

  async function decline(memberId: string, name: string) {
    const { error } = await supabase.from('league_members').delete().eq('id', memberId)
    if (error) {
      toast({ title: 'Failed to decline', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: `${name} declined` }); fetch()
    }
  }

  if (pending.length === 0) return (
    <div className="text-center py-8 text-gray-400 text-sm">
      <Clock className="w-6 h-6 mx-auto mb-1 text-gray-300" />
      No pending requests
    </div>
  )

  return (
    <div className="space-y-2">
      {pending.map(m => (
        <Card key={m.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <PlayerAvatar name={m.profiles.display_name} color={m.profiles.avatar_color} imageUrl={m.profiles.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{m.profiles.display_name}</p>
                <p className="text-xs text-gray-400">{m.profiles.email}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="sm" variant="outline"
                  className="h-8 gap-1 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() => approve(m.id, m.profiles.display_name)}
                >
                  <UserCheck className="w-3.5 h-3.5" /> Approve
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-8 gap-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => decline(m.id, m.profiles.display_name)}
                >
                  <UserX className="w-3.5 h-3.5" /> Decline
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
