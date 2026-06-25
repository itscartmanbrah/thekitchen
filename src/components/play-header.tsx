'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppLogo } from '@/components/app-logo'
import { ArrowLeft } from 'lucide-react'

// Logo links to the dashboard when you're signed in (a real account) instead of
// the public homepage — so clicking it never lands you on the login screen.
export function PlayHeader({ right }: { right?: ReactNode }) {
  const supabase = createClient()
  const [home, setHome] = useState('/')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      setHome(u && !(u as any).is_anonymous ? '/dashboard' : '/')
    })
  }, [])

  return (
    <header className="border-b bg-white sticky top-0 z-40">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        <Link href={home} className="flex items-center gap-2 min-w-0">
          <AppLogo className="w-7 h-7 shrink-0" />
          <span className="font-bold text-gray-900 truncate">The Kitchen</span>
        </Link>
        {right}
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
    <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  )
}
