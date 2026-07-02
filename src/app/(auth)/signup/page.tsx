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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { pickAvatarColor } from '@/lib/utils'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { Loader2 } from 'lucide-react'

// Letters (including Latin accents), apostrophes, hyphens, spaces
const NAME_RE = /^[A-Za-zÀ-ɏḀ-ỿ'\- ]+$/
// 7–15 digits once formatting characters are stripped, optional leading +
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/

function validateSignup(fields: {
  firstName: string; lastName: string; phone: string; birthday: string
  password: string; confirmPassword: string
}): string | null {
  const { firstName, lastName, phone, birthday, password, confirmPassword } = fields

  if (!NAME_RE.test(firstName.trim())) {
    return 'First name can only contain letters, hyphens and apostrophes.'
  }
  if (!NAME_RE.test(lastName.trim())) {
    return 'Last name can only contain letters, hyphens and apostrophes.'
  }

  if (phone.trim()) {
    const digits = phone.replace(/\D/g, '')
    if (!PHONE_RE.test(phone.trim()) || digits.length < 7 || digits.length > 15) {
      return 'Enter a valid phone number (digits only, e.g. +1 555 000 0000).'
    }
  }

  const dob = new Date(birthday)
  const now = new Date()
  if (isNaN(dob.getTime()) || dob >= now) {
    return 'Date of birth must be in the past.'
  }
  const age = (now.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)
  if (age < 5 || age > 120) {
    return 'Please enter a valid date of birth.'
  }

  if (password.length < 6) return 'Password must be at least 6 characters.'
  if (password !== confirmPassword) return 'Passwords do not match.'

  return null
}

export default function SignupPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nickname, setNickname] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()

    const validationError = validateSignup({ firstName, lastName, phone, birthday, password, confirmPassword })
    if (validationError) {
      toast({ title: 'Check your details', description: validationError, variant: 'destructive' })
      return
    }

    setLoading(true)

    const cleanFirst = firstName.trim()
    const cleanLast  = lastName.trim()
    const cleanPhone = phone.trim() || null
    const displayName = nickname?.trim() || `${cleanFirst} ${cleanLast}`.trim()
    const avatarColor = pickAvatarColor(displayName)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: cleanFirst,
          last_name: cleanLast,
          nickname: nickname.trim() || null,
          birthday: birthday || null,
          gender: gender || null,
          phone: cleanPhone,
          display_name: displayName,
          avatar_color: avatarColor,
        },
      },
    })

    if (error) {
      toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        first_name: cleanFirst,
        last_name: cleanLast,
        nickname: nickname.trim() || null,
        birthday: birthday || null,
        gender: gender || null,
        phone: cleanPhone,
        display_name: displayName,
        avatar_color: avatarColor,
      } as any)

      await claimOpenPlayGuests()   // link any Open Play games they joined as a guest
      // Stay in the loading state while the dashboard renders
      const rd = new URLSearchParams(window.location.search).get('redirect')
      router.push(rd && rd.startsWith('/') && !rd.startsWith('//') ? rd : '/dashboard')
      router.refresh()
      return
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <AppLogo className="w-10 h-10" />
          <span className="font-bold text-2xl text-foreground">The Kitchen</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create your player account</CardTitle>
            <CardDescription>Register to join leagues and track your rankings</CardDescription>
          </CardHeader>

          <CardContent className="pb-0">
            <GoogleSignInButton label="Sign up with Google" />
            <div className="flex items-center gap-3 my-4">
              <span className="flex-1 h-px bg-muted" />
              <span className="text-xs text-muted-foreground/80">or sign up with email</span>
              <span className="flex-1 h-px bg-muted" />
            </div>
          </CardContent>

          <form onSubmit={handleSignup}>
            <CardContent className="space-y-5 pt-0">

              {/* Name */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Name</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First name *</Label>
                    <Input
                      id="firstName"
                      placeholder="Jamie"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last name *</Label>
                    <Input
                      id="lastName"
                      placeholder="Chen"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nickname">
                  Nickname <span className="text-muted-foreground/80 font-normal">(optional — shown on leaderboard)</span>
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email address *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="jamie@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">
                      Phone number <span className="text-muted-foreground/80 font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      placeholder="+1 (555) 000-0000"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/[^\d\s+\-().]/g, ''))}
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="birthday">Date of birth *</Label>
                    <Input
                      id="birthday"
                      type="date"
                      value={birthday}
                      onChange={e => setBirthday(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gender">
                      Gender <span className="text-muted-foreground/80 font-normal">(optional — needed for Men&apos;s/Women&apos;s/Mixed tournament divisions)</span>
                    </Label>
                    <select
                      id="gender"
                      value={gender}
                      onChange={e => setGender(e.target.value)}
                      className="w-full h-10 text-sm border border-input rounded-md px-3 bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Prefer not to say</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Password */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Password</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword">Confirm password *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating account…
                  </>
                ) : 'Create account'}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>

            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  )
}
