'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppLogo } from '@/components/app-logo'
import { ArrowLeft } from 'lucide-react'

// Header for the standalone /play pages. Always shows a Back button, and the
// logo goes to the dashboard when you're signed in (a real account) instead of
// the public homepage — so you never land on the login screen by accident.
export function PlayHeader({ right }: { right?: ReactNode }) {
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
    <header className="border-b bg-white sticky top-0 z-40">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 pr-2" aria-label="Back">
            <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Back</span>
          </button>
          <Link href={home} className="flex items-center gap-2 min-w-0">
            <AppLogo className="w-7 h-7 shrink-0" />
            <span className="font-bold text-gray-900 truncate">The Kitchen</span>
          </Link>
        </div>
        {right}
      </div>
    </header>
  )
}
