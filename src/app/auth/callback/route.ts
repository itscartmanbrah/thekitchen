import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Completes an OAuth (e.g. Google) sign-in: exchanges the returned code for a
// session, then redirects into the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  // only allow internal paths (no open-redirect)
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — send them back to login with a flag
  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
