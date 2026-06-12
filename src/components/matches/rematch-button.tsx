'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { RefreshCw } from 'lucide-react'

interface Props {
  match: any
  onCreated: () => void
}

export function RematchButton({ match, onCreated }: Props) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  async function handleRematch() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: newMatch, error } = await supabase
      .from('matches')
      .insert({
        league_id: match.league_id,
        format: match.format,
        status: 'scheduled',
        officiator_id: match.officiator_id ?? null,
        max_points: match.max_points,
        created_by: user.id,
      } as any)
      .select()
      .single()

    if (error || !newMatch) {
      toast({ title: 'Failed to create rematch', description: error?.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    const players = (match.match_players ?? []).map((p: any) => ({
      match_id: (newMatch as any).id,
      user_id: p.user_id,
      team: p.team,
      elo_before: p.elo_after ?? p.elo_before,
    }))

    await supabase.from('match_players').insert(players as any)

    toast({ title: 'Rematch created!', description: 'Same players, same format.' })
    onCreated()
    setLoading(false)
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-1 text-gray-500 hover:text-gray-800 px-2 sm:px-3"
      onClick={handleRematch}
      disabled={loading}
      title="Rematch — same players, same format"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{loading ? 'Creating…' : 'Rematch'}</span>
    </Button>
  )
}
