'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getInitials } from '@/lib/utils'
import { AppLogo } from '@/components/app-logo'
import { InstallAppButton } from '@/components/install-app-button'
import { NotificationsBell } from '@/components/notifications-bell'
import type { Profile } from '@/types/database'

export function Navbar({ profile }: { profile: Profile | null }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="border-b bg-white sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <AppLogo className="w-7 h-7" />
          <span className="font-bold text-gray-900">The Kitchen</span>
        </Link>

        <div className="flex items-center gap-2">
          <InstallAppButton />
          {profile && <NotificationsBell userId={profile.id} />}
          {profile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 rounded-full overflow-hidden cursor-pointer hover:opacity-90 transition-opacity shrink-0">
                  {(profile as any).avatar_url ? (
                    <img src={(profile as any).avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white text-sm font-semibold"
                      style={{ backgroundColor: profile.avatar_color ?? '#16a34a' }}
                    >
                      {getInitials(profile.display_name)}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{profile.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/play/host">My Open Play</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/my-bookings">My Bookings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/help">Help &amp; guides</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}
