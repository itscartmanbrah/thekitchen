import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { code } = await request.json()
  const expected = process.env.BETA_ACCESS_CODE

  if (!expected || code?.trim().toLowerCase() !== expected.trim().toLowerCase()) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('beta_access', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // 30 days — testers won't need to re-enter the code constantly
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return response
}
