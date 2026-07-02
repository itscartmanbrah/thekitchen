'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getInitials } from '@/lib/utils'
import { AppLogo } from '@/components/app-logo'
import { ArrowLeft } from 'lucide-react'

interface MiniProfile { id: string; display_name: string; email: string | null; avatar_url: string | null; avatar_color: string | null }

// Logo links to the dashboard when you're signed in (a real account) instead of
// the public homepage — so clicking it never lands you on the login screen. The
// top-right mirrors the main navbar: your avatar/menu when signed in, otherwise
// a Sign in link — so creating an Open Play session never looks logged-out.
export function PlayHeader({ right }: { right?: ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const [home, setHome] = useState('/')
  const [profile, setProfile] = useState<MiniProfile | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user
      const signedIn = !!u && !(u as any).is_anonymous
      setHome(signedIn ? '/dashboard' : '/')
      if (signedIn && u) {
        const { data: p } = await supabase.from('profiles')
          .select('id, display_name, email, avatar_url, avatar_color').eq('id', u.id).single()
        if (p) setProfile(p as MiniProfile)
      }
      setReady(true)
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/'); router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        <Link href={home} className="flex items-center gap-2 min-w-0">
          <AppLogo className="w-7 h-7 shrink-0" />
          <span className="font-bold text-foreground truncate">The Kitchen</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          {!ready ? (
            <div className="w-8 h-8" />
          ) : profile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 rounded-full overflow-hidden cursor-pointer hover:opacity-90 transition-opacity shrink-0">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: profile.avatar_color ?? '#16a34a' }}>
                      {getInitials(profile.display_name)}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{profile.display_name}</p>
                  {profile.email && <p className="text-xs text-muted-foreground truncate">{profile.email}</p>}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/dashboard">Dashboard</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/play/host">My Open Play</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/profile">Profile</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-red-600">Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/login" className="text-sm text-muted-foreground hover:text-primary">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  )
}

// A plain "Back" link placed at the top of page content (matches the league
// page's "← Leagues"). Goes back in history, falling back to a safe home.
export function PlayBack() {
  const supabase = createClient()
  const router = useRouter()
  const [home, setHome] = useState('/')
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      setHome(u && !(u as any).is_anonymous ? '/dashboard' : '/')
    })
  }, [])
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(home)
  }
  return (
    <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  )
}
