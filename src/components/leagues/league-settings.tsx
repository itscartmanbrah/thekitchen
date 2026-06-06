'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { BANNER_COLORS } from '@/lib/utils'
import type { League } from '@/types/database'

export function LeagueSettings({ league, isHeadAdmin }: { league: League; isHeadAdmin: boolean }) {
  const [name, setName] = useState(league.name)
  const [description, setDescription] = useState(league.description ?? '')
  const [location, setLocation] = useState(league.location ?? '')
  const [bannerColor, setBannerColor] = useState<string>(league.banner_color)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase
      .from('leagues')
      .update({ name, description: description || null, location: location || null, banner_color: bannerColor } as any)
      .eq('id', league.id)
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'League updated' })
      router.refresh()
    }
    setSaving(false)
  }

  async function handleDelete() {
    const { error } = await supabase.from('leagues').delete().eq('id', league.id)
    if (error) {
      toast({ title: 'Failed to delete league', description: error.message, variant: 'destructive' })
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">League details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} />
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
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </form>
        </CardContent>
      </Card>

      {isHeadAdmin && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base text-red-600">Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">Permanently delete this league and all its data. This cannot be undone.</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">Delete league</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {league.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the league, all matches, and all rankings. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, delete league
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
