import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const protectedRoutes = ['/dashboard', '/leagues', '/profile', '/players']
  const authRoutes = ['/login', '/signup']

  if (!user && protectedRoutes.some(r => pathname.startsWith(r))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && authRoutes.includes(pathname)) {
    // Already signed in on a login/signup link — honour ?redirect (e.g. a
    // /play/<code> join link with &join=1) instead of dumping them on the
    // dashboard, so "Sign in & join" still enrols them in the session.
    const rd = request.nextUrl.searchParams.get('redirect')
    const join = request.nextUrl.searchParams.get('join')
    let dest = '/dashboard'
    if (rd && rd.startsWith('/') && !rd.startsWith('//')) {
      dest = join === '1' ? `${rd}${rd.includes('?') ? '&' : '?'}join=1` : rd
    }
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}
