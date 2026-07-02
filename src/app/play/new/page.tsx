'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setActiveHost } from '@/lib/active-host'
import { ResumeSessionBanner } from '@/components/resume-session-banner'
import { PlayHeader, PlayBack } from '@/components/play-header'
import { StyleExplainer } from '@/components/open-play-styles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Swords } from 'lucide-react'

const playStyles = [
  { k: 'balanced', label: 'Drop-in', desc: 'Queue + courts' },
  { k: 'king', label: 'King of the Court', desc: 'Winners up, losers down' },
  { k: 'americano', label: 'Americano', desc: 'Rotate partners' },
  { k: 'mexicano', label: 'Mexicano', desc: 'Pair by standings' },
  { k: 'skill', label: 'Skill-separated', desc: 'Keep levels close' },
  { k: 'mixed', label: 'Mixed Doubles', desc: '2 men + 2 women' },
  { k: 'skill_courts', label: 'Skill Courts', desc: 'Each court a level tier' },
] as const

export default function NewSoloSessionPage() {
  const supabase = createClient()
  const router = useRouter()
  const [name, setName] = useState('')
  const [courts, setCourts] = useState(2)
  const [format, setFormat] = useState<'doubles' | 'singles'>('doubles')
  const [mode, setMode] = useState<'balanced' | 'king' | 'americano' | 'mexicano' | 'skill' | 'mixed' | 'skill_courts'>('balanced')
  const [maxPlayers, setMaxPlayers] = useState('')   // optional cap; '' = no limit
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function start() {
    if (!name.trim()) { setError('Give your session a name.'); return }
    setBusy(true); setError('')
    try {
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { data, error: aErr } = await supabase.auth.signInAnonymously()
        if (aErr) { setError('Couldn’t start a session. Anonymous sign-in may be disabled.'); setBusy(false); return }
        user = data.user
      }
      const { data, error: cErr } = await supabase.rpc('create_solo_session', {
        p_name: name.trim(), p_court_count: courts, p_format: format, p_match_mode: mode,
      })
      const res = data as { id: string; manage_code: string; share_code: string } | null
      if (cErr || !res) { setError(cErr?.message ?? 'Could not create the session.'); setBusy(false); return }
      const cap = parseInt(maxPlayers, 10)
      if (!isNaN(cap) && cap >= 2) await supabase.rpc('set_session_max_players', { p_session_id: res.id, p_max: cap })
      setActiveHost({ manageCode: res.manage_code, shareCode: res.share_code, name: name.trim() })
      router.push(`/play/host/${res.manage_code}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <PlayHeader />

      <ResumeSessionBanner />

      <main className="max-w-md mx-auto px-4 py-10">
        <PlayBack />
        <div className="flex items-center gap-2 mb-1">
          <Swords className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Start an Open Play session</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">No account needed. Add players by name and run it — auto-balanced matchups, fair rotation, live board.</p>

        <div className="space-y-4 bg-card border rounded-2xl p-5">
          <div className="space-y-1.5">
            <Label htmlFor="n">Session name</Label>
            <Input id="n" placeholder="e.g. Tuesday Night Pickleball" value={name} onChange={e => { setName(e.target.value); setError('') }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c">Courts</Label>
              <Input id="c" type="number" min={1} max={15} value={courts} onChange={e => setCourts(Math.max(1, Math.min(15, parseInt(e.target.value || '1', 10))))} />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="flex gap-1">
                {(['doubles', 'singles'] as const).map(f => (
                  <button key={f} type="button" onClick={() => setFormat(f)}
                    className={`flex-1 text-sm py-2 rounded-lg border capitalize ${format === f ? 'border-primary bg-primary/10 text-blue-600 dark:text-blue-300 font-medium' : 'border-border text-muted-foreground'}`}>{f}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Play style</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {playStyles.map(m => (
                <button key={m.k} type="button" onClick={() => setMode(m.k)}
                  className={`text-left px-3 py-2 rounded-lg border ${mode === m.k ? 'border-primary bg-primary/10 text-blue-600 dark:text-blue-300' : 'border-border text-muted-foreground'}`}>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-[10px] text-muted-foreground/80">{m.desc}</span>
                </button>
              ))}
            </div>
            <StyleExplainer mode={mode} courtCount={courts} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mx">Max players <span className="text-muted-foreground/80 font-normal">(optional)</span></Label>
            <Input id="mx" type="number" min={2} max={200} placeholder="No limit" value={maxPlayers}
              onChange={e => setMaxPlayers(e.target.value)} />
            <p className="text-xs text-muted-foreground/80">When full, extra check-ins go on a waitlist and are let in automatically as spots free up.</p>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button onClick={start} disabled={busy} className="w-full">{busy ? 'Starting…' : 'Start session →'}</Button>
          <p className="text-[11px] text-muted-foreground/80 text-center">Standalone sessions don’t track ELO. Want ratings &amp; history? <Link href="/signup" className="text-primary hover:underline">Create a free league</Link>.</p>
        </div>
      </main>
    </div>
  )
}
