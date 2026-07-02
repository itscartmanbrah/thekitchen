'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { UserCog, X } from 'lucide-react'

// Nudges users (esp. Google sign-ups) to add gender / date of birth so
// gender- and age-based tournament divisions work for them.
export function ProfileCompletionBanner() {
  const [missing, setMissing] = useState<string[]>([])
  const [dismissed, setDismissed] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('gender, birthday').eq('id', user.id).single()
      const miss: string[] = []
      if (!(data as any)?.gender) miss.push('gender')
      if (!(data as any)?.birthday) miss.push('date of birth')
      if (miss.length === 0) return
      const dismissedKey = localStorage.getItem('profile_nudge_dismissed')
      setMissing(miss)
      setDismissed(dismissedKey === '1')
    })
  }, [])

  if (dismissed || missing.length === 0) return null

  function dismiss() {
    localStorage.setItem('profile_nudge_dismissed', '1')
    setDismissed(true)
  }

  const list = missing.length === 2 ? 'your gender and date of birth' : `your ${missing[0]}`

  return (
    <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
        <UserCog className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-200">Finish setting up your profile</p>
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Add {list} so you can join Men&apos;s, Women&apos;s, Mixed, and age-based tournament divisions.
        </p>
      </div>
      <Button size="sm" asChild className="shrink-0">
        <Link href="/profile">Complete profile</Link>
      </Button>
      <button onClick={dismiss} className="text-amber-400 hover:text-amber-300 shrink-0" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
