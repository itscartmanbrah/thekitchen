'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function BetaGatePage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/beta-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })

    if (res.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError('Incorrect access code. Please check with the administrator.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">TK</span>
          </div>
          <span className="font-bold text-2xl text-gray-900">The Kitchen</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">🔒</span>
            </div>
            <CardTitle>Beta Access</CardTitle>
            <CardDescription>
              This app is currently in private beta. Enter your access code to continue.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Access code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter your code"
                  value={code}
                  onChange={e => { setCode(e.target.value); setError('') }}
                  required
                  autoFocus
                  autoComplete="off"
                  className="text-center text-lg tracking-widest font-mono"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 text-center">{error}</p>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
                {loading ? 'Checking…' : 'Enter'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Don&apos;t have a code? Contact the administrator to request beta access.
        </p>
      </div>
    </div>
  )
}
