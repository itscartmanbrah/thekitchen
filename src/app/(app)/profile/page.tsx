'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { AVATAR_COLORS, formatElo, getEloTier, getPickleballRating } from '@/lib/utils'
import { Trophy, ExternalLink, Camera } from 'lucide-react'
import type { Profile } from '@/types/database'

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [memberships, setMemberships] = useState<any[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nickname, setNickname] = useState('')
  const [birthday, setBirthday] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarColor, setAvatarColor] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)

  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return router.push('/login')

      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        const p = data as unknown as Profile
        setProfile(p)
        setFirstName(p.first_name ?? '')
        setLastName(p.last_name ?? '')
        setNickname(p.nickname ?? '')
        setBirthday(p.birthday ?? '')
        setPhone(p.phone ?? '')
        setAvatarColor(p.avatar_color)
        setAvatarUrl((p as any).avatar_url ?? null)
      }

      // Fetch league stats
      const { data: ms } = await supabase
        .from('league_members')
        .select('*, leagues(*)')
        .eq('user_id', user.id)
        .order('elo_rating', { ascending: false })

      // Fetch rank per league
      const ranked = await Promise.all(
        (ms ?? []).map(async (m: any) => {
          const { count } = await supabase
            .from('league_members')
            .select('*', { count: 'exact', head: true })
            .eq('league_id', m.league_id)
            .gt('elo_rating', m.elo_rating)
          const { count: total } = await supabase
            .from('league_members')
            .select('*', { count: 'exact', head: true })
            .eq('league_id', m.league_id)
          return { ...m, rank: (count ?? 0) + 1, totalPlayers: total ?? 1 }
        })
      )
      setMemberships(ranked)
    }).catch(() => {
      // non-fatal — profile edit still works without league stats
    })
  }, [])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Please choose an image under 2MB.', variant: 'destructive' })
      return
    }

    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' })
      setUploadingAvatar(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    // Bust cache with timestamp
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    await supabase.from('profiles').update({ avatar_url: urlWithBust } as any).eq('id', profile.id)
    setAvatarUrl(urlWithBust)
    toast({ title: 'Profile picture updated!' })
    setUploadingAvatar(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)

    const displayName = nickname.trim() || `${firstName} ${lastName}`.trim()

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        nickname: nickname || null,
        birthday: birthday || null,
        phone: phone || null,
        display_name: displayName,
        avatar_color: avatarColor,
      } as any)
      .eq('id', profile.id)

    if (error) {
      const isDuplicate = error.message.includes('profiles_display_name_unique') || error.code === '23505'
      toast({
        title: isDuplicate ? 'Nickname already taken' : 'Save failed',
        description: isDuplicate
          ? `"${displayName}" is already in use. Please choose a different nickname.`
          : error.message,
        variant: 'destructive',
      })
    } else {
      toast({ title: 'Profile updated' })
      setProfile({ ...profile, first_name: firstName, last_name: lastName, nickname: nickname || null, birthday: birthday || null, phone: phone || null, display_name: displayName, avatar_color: avatarColor })
      router.refresh()
    }
    setSaving(false)
  }

  if (!profile) return <div className="text-center py-12 text-gray-500">Loading…</div>

  const previewName = nickname.trim() || `${firstName} ${lastName}`.trim() || profile.display_name

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <Link href={`/players/${profile.id}`}>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <ExternalLink className="w-3.5 h-3.5" />
            View public profile
          </Button>
        </Link>
      </div>

      {/* ── League stats ── */}
      {memberships.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Rankings</p>
          {memberships.map((m: any) => {
            const mPb   = getPickleballRating(m.elo_rating)
            const mTier = getEloTier(m.elo_rating)
            const mWR   = m.wins + m.losses > 0
              ? Math.round((m.wins / (m.wins + m.losses)) * 100)
              : null
            return (
              <Card key={m.id} className="overflow-hidden">
                <div className="h-1" style={{ backgroundColor: m.leagues?.banner_color ?? '#16a34a' }} />
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{m.leagues?.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <div className="flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                          <Trophy className="w-3 h-3 text-gray-500" />
                          <span className="text-xs font-semibold text-gray-700">#{m.rank} of {m.totalPlayers}</span>
                        </div>
                        <span className={`text-xs font-semibold ${mPb.color}`}>{mPb.rating}</span>
                        <span className="text-gray-300 text-xs">·</span>
                        <span className={`text-xs ${mTier.color}`}>{mTier.label}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-gray-900">{formatElo(m.elo_rating)}</p>
                      <p className="text-xs text-gray-500">
                        <span className="text-green-600 font-medium">{m.wins}W</span>
                        {' – '}
                        {m.losses}L
                        {mWR !== null && <span className="ml-1 text-gray-400">({mWR}%)</span>}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Player details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">

            {/* Avatar preview + upload */}
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <div className="relative shrink-0">
                <PlayerAvatar name={previewName} color={avatarColor} imageUrl={avatarUrl} size="lg" />
                <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-100 shadow-sm">
                  <Camera className="w-3 h-3 text-gray-600" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                  />
                </label>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{previewName}</p>
                <p className="text-xs text-gray-500">{profile.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {uploadingAvatar ? 'Uploading…' : 'Click the camera icon to change photo'}
                </p>
              </div>
            </div>

            {/* Name */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Name</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name *</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name *</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nickname">
                Nickname <span className="text-gray-400 font-normal text-xs">(shown on leaderboard if set)</span>
              </Label>
              <Input
                id="nickname"
                placeholder="e.g. The Dink King"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
              />
            </div>

            <Separator />

            {/* Contact */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Contact</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Email address</Label>
                  <Input value={profile.email} disabled className="bg-gray-50 text-gray-500" />
                  <p className="text-xs text-gray-400">Email cannot be changed here.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="birthday">Date of birth</Label>
                  <Input
                    id="birthday"
                    type="date"
                    value={birthday}
                    onChange={e => setBirthday(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Avatar color */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avatar color</p>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${avatarColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setAvatarColor(color)}
                  />
                ))}
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
