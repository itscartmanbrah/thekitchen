'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { LogIn } from 'lucide-react'

export function JoinLeagueDialog() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: league, error } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('invite_code', code.toUpperCase().trim())
      .single() as any

    if (error || !league) {
      toast({ title: 'Invalid invite code', description: 'Double-check the code and try again.', variant: 'destructive' })
      setLoading(false)
      return
    }

    const { data: existing } = await supabase
      .from('league_members')
      .select('id')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      toast({ title: 'Already a member', description: `You're already in ${league.name}.` })
      setOpen(false)
      router.push(`/leagues/${league.id}`)
      setLoading(false)
      return
    }

    // Check if league uses waitlist (invite_links table with approval mode)
    // For now: check if there are any invite_links rows for this league
    // If yes → join as pending, else join as active (legacy invite_code flow)
    const { count: linkCount } = await supabase
      .from('invite_links')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id)
      .eq('is_active', true)

    const useWaitlist = (linkCount ?? 0) > 0

    // If using invite links, validate the code against invite_links table too
    // (the legacy leagues.invite_code still works as an always-active bypass)

    const { error: joinError } = await supabase.from('league_members').insert({
      league_id: league.id,
      user_id: user.id,
      role: 'player',
      elo_rating: 1000,
      status: useWaitlist ? 'pending' : 'active',
    } as any)

    if (joinError) {
      toast({ title: 'Failed to join', description: joinError.message, variant: 'destructive' })
    } else if (useWaitlist) {
      toast({ title: `Request sent to ${league.name}`, description: 'Waiting for admin approval.' })
      setOpen(false); setCode('')
    } else {
      toast({ title: `Joined ${league.name}!`, description: 'Welcome to the league.' })
      setOpen(false); setCode('')
      router.refresh()
      router.push(`/leagues/${league.id}`)
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <LogIn className="w-4 h-4 mr-1" />
          Join league
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Join a league</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleJoin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              placeholder="e.g. PK7X2Q"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono text-lg tracking-widest text-center"
              required
            />
            <p className="text-xs text-muted-foreground">Ask your league admin for the 6-character code.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || code.length < 6}>
              {loading ? 'Joining…' : 'Join league'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
