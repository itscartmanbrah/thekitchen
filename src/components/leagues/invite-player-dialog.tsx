'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Search, UserPlus, X } from 'lucide-react'
import type { LeagueRole } from '@/types/database'

interface Props {
  leagueId: string
  onInvited: () => void
}

interface ProfileResult {
  id: string
  display_name: string
  avatar_color: string
  avatar_url: string | null
  email: string
}

const roleLabels: Record<string, string> = {
  player: 'Player',
  officiator: 'Officiator',
  admin: 'Admin',
}

export function InvitePlayerDialog({ leagueId, onInvited }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProfileResult[]>([])
  const [selected, setSelected] = useState<ProfileResult | null>(null)
  const [role, setRole] = useState<LeagueRole>('player')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const supabase = createClient()

  // Fetch existing member IDs so we can exclude them from results
  const [existingIds, setExistingIds] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
      .then(({ data }) => setExistingIds((data ?? []).map((r: any) => r.user_id)))
  }, [open, leagueId])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_color, avatar_url, email')
        .ilike('display_name', `%${query}%`)
        .limit(10)
      const filtered = (data ?? []).filter((p: ProfileResult) => !existingIds.includes(p.id))
      setResults(filtered as ProfileResult[])
      setSearching(false)
      setDropdownOpen(true)
    }, 300)
    return () => clearTimeout(t)
  }, [query, existingIds])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function pickPlayer(p: ProfileResult) {
    setSelected(p)
    setQuery('')
    setResults([])
    setDropdownOpen(false)
  }

  function reset() {
    setSelected(null)
    setQuery('')
    setResults([])
    setRole('player')
  }

  async function handleInvite() {
    if (!selected) return
    setLoading(true)

    // Add as 'invited' — player must accept before becoming active
    const { error } = await supabase.from('league_members').insert({
      league_id: leagueId,
      user_id: selected.id,
      role,
      elo_rating: 1000,
      status: 'invited',
    } as any)

    if (error) {
      toast({ title: 'Invite failed', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    // Notify the invited player
    const { data: leagueData } = await supabase
      .from('leagues')
      .select('name')
      .eq('id', leagueId)
      .single()

    await supabase.from('notifications').insert({
      user_id: selected.id,
      type: 'league_invite',
      title: '🎾 You have been invited to a league!',
      body: `You've been invited to join ${(leagueData as any)?.name ?? 'a league'} as a ${roleLabels[role]}. Accept or decline below.`,
      data: { league_id: leagueId, role },
    } as any)

    toast({ title: `Invite sent to ${selected.display_name}!`, description: 'They will need to accept before joining.' })
    reset()
    setOpen(false)
    onInvited()
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          Invite player
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite a player</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Player search */}
          <div className="space-y-1.5">
            <Label>Search by nickname</Label>
            {selected ? (
              // Selected player chip
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/40">
                <PlayerAvatar name={selected.display_name} color={selected.avatar_color} imageUrl={selected.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selected.display_name}</p>
                  <p className="text-xs text-muted-foreground/80 truncate">{selected.email}</p>
                </div>
                <button onClick={reset} className="text-muted-foreground/80 hover:text-muted-foreground shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              // Search input + dropdown
              <div ref={containerRef} className="relative">
                <div className="flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 focus-within:ring-1 focus-within:ring-ring">
                  <Search className="w-3.5 h-3.5 text-muted-foreground/80 shrink-0" />
                  <input
                    className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                    placeholder="Type a player name…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => results.length > 0 && setDropdownOpen(true)}
                  />
                  {searching && <span className="text-xs text-muted-foreground/80">…</span>}
                </div>

                {dropdownOpen && (
                  <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-card shadow-md">
                    {results.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted-foreground/80">
                        {query.trim() ? 'No players found' : 'Start typing to search'}
                      </li>
                    ) : results.map(p => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left"
                          onMouseDown={e => { e.preventDefault(); pickPlayer(p) }}
                        >
                          <PlayerAvatar name={p.display_name} color={p.avatar_color} imageUrl={p.avatar_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.display_name}</p>
                            <p className="text-xs text-muted-foreground/80 truncate">{p.email}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Role selector */}
          <div className="space-y-1.5">
            <Label>Assign role</Label>
            <Select value={role} onValueChange={v => setRole(v as LeagueRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="player">Player</SelectItem>
                <SelectItem value="officiator">Officiator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground/80">
              They will receive a notification and must accept to join.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); reset() }}>Cancel</Button>
          <Button onClick={handleInvite} disabled={!selected || loading} className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            {loading ? 'Inviting…' : 'Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
