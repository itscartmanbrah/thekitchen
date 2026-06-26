'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { AppLogo } from '@/components/app-logo'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { claimOpenPlayGuests } from '@/lib/claim-guests'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast({ title: 'Login failed', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }
    await claimOpenPlayGuests()   // link any Open Play games they joined as a guest
    // Keep the button in its loading state while the dashboard renders —
    // resetting it here makes the page look frozen during navigation.
    const rd = new URLSearchParams(window.location.search).get('redirect')
    router.push(rd && rd.startsWith('/') && !rd.startsWith('//') ? rd : '/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <AppLogo className="w-10 h-10" />
          <span className="font-bold text-2xl text-gray-900">The Kitchen</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 pb-0">
            <GoogleSignInButton label="Sign in with Google" />
            <div className="flex items-center gap-3 my-4">
              <span className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <span className="flex-1 h-px bg-gray-200" />
            </div>
          </CardContent>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-green-600 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in…
                  </>
                ) : 'Sign in'}
              </Button>
              <p className="text-sm text-center text-gray-600">
                No account?{' '}
                <Link href="/signup" className="text-green-600 hover:underline font-medium">
                  Create one free
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
