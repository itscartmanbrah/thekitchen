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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { BANNER_COLORS } from '@/lib/utils'
import { ImagePlus, X } from 'lucide-react'
import type { League } from '@/types/database'

export function LeagueSettings({ league, isHeadAdmin }: { league: League; isHeadAdmin: boolean }) {
  const [name, setName] = useState(league.name)
  const [description, setDescription] = useState(league.description ?? '')
  const [location, setLocation] = useState(league.location ?? '')
  const [bannerColor, setBannerColor] = useState<string>(league.banner_color)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>((league as any).banner_image_url ?? null)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Please choose an image under 5MB.', variant: 'destructive' })
      return
    }

    setUploadingBanner(true)
    const ext = file.name.split('.').pop()
    const path = `${league.id}/banner.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('league-banners')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' })
      setUploadingBanner(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('league-banners').getPublicUrl(path)
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    await supabase.from('leagues').update({ banner_image_url: urlWithBust } as any).eq('id', league.id)
    setBannerImageUrl(urlWithBust)
    toast({ title: 'Banner image updated!' })
    router.refresh()
    setUploadingBanner(false)
  }

  async function handleRemoveBanner() {
    await supabase.from('leagues').update({ banner_image_url: null } as any).eq('id', league.id)
    setBannerImageUrl(null)
    toast({ title: 'Banner image removed' })
    router.refresh()
  }

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
    setDeleteError('')
    setDeleting(true)

    // Re-authenticate with password before deleting
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setDeleteError('Could not verify your identity. Please refresh and try again.')
      setDeleting(false)
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: deletePassword,
    })

    if (authError) {
      setDeleteError('Incorrect password. Please try again.')
      setDeleting(false)
      return
    }

    const { error } = await supabase.from('leagues').delete().eq('id', league.id)
    if (error) {
      toast({ title: 'Failed to delete league', description: error.message, variant: 'destructive' })
      setDeleting(false)
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

            <div className="space-y-2">
              <Label>Banner image <span className="text-gray-400 font-normal text-xs">(optional — replaces the color strip)</span></Label>
              {bannerImageUrl ? (
                <div className="relative rounded-lg overflow-hidden border">
                  <img src={bannerImageUrl} alt="Banner" className="w-full h-24 object-cover" />
                  <button
                    type="button"
                    onClick={handleRemoveBanner}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors">
                  <ImagePlus className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {uploadingBanner ? 'Uploading…' : 'Upload banner image'}
                    </p>
                    <p className="text-xs text-gray-400">PNG, JPG, WEBP up to 5MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBannerUpload}
                    disabled={uploadingBanner}
                  />
                </label>
              )}
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
            <Button variant="destructive" size="sm" onClick={() => { setShowDeleteDialog(true); setDeletePassword(''); setDeleteError('') }}>
              Delete league
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Password confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={open => { setShowDeleteDialog(open); setDeletePassword(''); setDeleteError('') }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete {league.name}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">
              This will permanently delete the league, all matches, and all rankings. <strong>This cannot be undone.</strong>
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-password">Enter your password to confirm</Label>
              <Input
                id="delete-password"
                type="password"
                placeholder="Your account password"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                autoFocus
              />
              {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || !deletePassword.trim()}
            >
              {deleting ? 'Deleting…' : 'Yes, delete league'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
