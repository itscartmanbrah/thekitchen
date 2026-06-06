'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { generateInviteCode, BANNER_COLORS } from '@/lib/utils'
import { Plus } from 'lucide-react'

export function CreateLeagueDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [bannerColor, setBannerColor] = useState<string>(BANNER_COLORS[0])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const inviteCode = generateInviteCode()

    const { data: league, error } = await supabase
      .from('leagues')
      .insert({
        name,
        description: description || null,
        location: location || null,
        invite_code: inviteCode,
        banner_color: bannerColor,
        created_by: user.id,
      } as any)
      .select()
      .single()

    if (error) {
      toast({ title: 'Failed to create league', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    await supabase.from('league_members').insert({
      league_id: (league as any).id,
      user_id: user.id,
      role: 'head_admin',
      elo_rating: 1000,
    } as any)

    toast({ title: 'League created!', description: `Invite code: ${inviteCode}` })
    setOpen(false)
    setName(''); setDescription(''); setLocation(''); setBannerColor(BANNER_COLORS[0])
    router.refresh()
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-1" />
          New league
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a league</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="league-name">League name *</Label>
            <Input
              id="league-name"
              placeholder="Sunday Smashers"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="league-desc">Description</Label>
            <Textarea
              id="league-desc"
              placeholder="What's this league about?"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="league-loc">Court / location</Label>
            <Input
              id="league-loc"
              placeholder="Riverside Park Court 3"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Banner color</Label>
            <div className="flex gap-2 flex-wrap">
              {BANNER_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${bannerColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setBannerColor(color)}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || !name}>
              {loading ? 'Creating…' : 'Create league'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
