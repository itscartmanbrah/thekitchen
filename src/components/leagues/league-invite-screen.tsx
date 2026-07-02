'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle, XCircle } from 'lucide-react'
import type { League } from '@/types/database'

interface Props {
  league: League
  membershipId: string
  userId: string
}

export function LeagueInviteScreen({ league, membershipId, userId }: Props) {
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function accept() {
    setLoading('accept')
    const { error } = await supabase
      .from('league_members')
      .update({ status: 'active' } as any)
      .eq('id', membershipId)

    if (error) {
      toast({ title: 'Failed to accept', description: error.message, variant: 'destructive' })
      setLoading(null)
      return
    }

    // Notify admins that the invite was accepted
    const { data: admins } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)
      .in('role', ['head_admin', 'admin'])
      .eq('status', 'active')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()

    if (admins && admins.length > 0) {
      await supabase.from('notifications').insert(
        admins.map((a: any) => ({
          user_id: a.user_id,
          type: 'invite_accepted',
          title: '✅ Invite accepted',
          body: `${(profile as any)?.display_name ?? 'A player'} accepted their invitation to join ${league.name}.`,
          data: { league_id: league.id },
        })) as any
      )
    }

    // Delete the invite notification so the bell doesn't still show it
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('type', 'league_invite')
      .eq('data->>league_id', league.id)

    toast({ title: `Welcome to ${league.name}!` })
    router.refresh()
  }

  async function decline() {
    setLoading('decline')
    const { error } = await supabase
      .from('league_members')
      .delete()
      .eq('id', membershipId)

    if (error) {
      toast({ title: 'Failed to decline', description: error.message, variant: 'destructive' })
      setLoading(null)
      return
    }

    // Notify admins that the invite was declined
    const { data: admins } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)
      .in('role', ['head_admin', 'admin'])
      .eq('status', 'active')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()

    if (admins && admins.length > 0) {
      await supabase.from('notifications').insert(
        admins.map((a: any) => ({
          user_id: a.user_id,
          type: 'invite_declined',
          title: '❌ Invite declined',
          body: `${(profile as any)?.display_name ?? 'A player'} declined their invitation to join ${league.name}.`,
          data: { league_id: league.id },
        })) as any
      )
    }

    // Delete the invite notification so the bell clears it too
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('type', 'league_invite')
      .eq('data->>league_id', league.id)

    toast({ title: 'Invitation declined' })
    router.push('/dashboard')
  }

  return (
    <div className="max-w-md mx-auto text-center py-24 px-4">
      {/* League colour strip */}
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
        style={{ backgroundColor: (league as any).banner_color + '33' }}>
        🎾
      </div>

      <h1 className="text-xl font-bold text-foreground mb-1">You&apos;ve been invited!</h1>
      <p className="text-muted-foreground text-sm mb-6">
        An admin has invited you to join <strong>{league.name}</strong>.
        {league.description && <><br /><span className="text-muted-foreground/80 text-xs">{league.description}</span></>}
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          onClick={accept}
          disabled={loading !== null}
          className="gap-2 bg-green-600 hover:bg-green-700"
        >
          <CheckCircle className="w-4 h-4" />
          {loading === 'accept' ? 'Accepting…' : 'Accept invitation'}
        </Button>
        <Button
          onClick={decline}
          disabled={loading !== null}
          variant="outline"
          className="gap-2 text-red-400 border-red-500/25 hover:bg-red-500/10 hover:text-red-400"
        >
          <XCircle className="w-4 h-4" />
          {loading === 'decline' ? 'Declining…' : 'Decline'}
        </Button>
      </div>
    </div>
  )
}
