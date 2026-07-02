import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CreateLeagueDialog } from '@/components/leagues/create-league-dialog'
import { JoinLeagueDialog } from '@/components/leagues/join-league-dialog'
import { ProfileCompletionBanner } from '@/components/profile-completion-banner'
import { FadeIn, FadeInStagger, FadeInItem } from '@/components/ui/fade-in'
import { formatElo } from '@/lib/utils'
import { Trophy, MapPin, TrendingUp, Swords, Play, Plus, Users, Percent, History, ArrowRight } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const nowIso = new Date().toISOString()
  const [{ data: profile }, { data: memberships }, { data: soloSessions }, { data: joinedRaw }, { data: opRows }, { data: historyRaw }] = await Promise.all([
    supabase.from('profiles').select('first_name, display_name').eq('id', user.id).single(),
    supabase.from('league_members').select('*, leagues (*)').eq('user_id', user.id).order('joined_at', { ascending: false }),
    supabase.from('play_sessions').select('id, name, match_mode, format, court_count, started_at, manage_code')
      .eq('created_by', user.id).is('league_id', null).is('ended_at', null)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`).order('started_at', { ascending: false }),
    supabase.rpc('get_my_active_open_play'),
    supabase.from('session_players').select('wins, losses, games').eq('user_id', user.id),
    supabase.rpc('get_my_open_play_history'),
  ])

  const joinedSessions = (joinedRaw as any[]) ?? []
  const rawName = (profile as any)?.first_name?.trim() || (profile as any)?.display_name?.split(' ')[0] || ''
  const firstName = rawName && !/^Guest-/i.test(rawName) ? rawName : 'there'

  // Headline stats
  const leagueCount = memberships?.length ?? 0
  const bestElo = leagueCount ? Math.max(...memberships!.map((m: any) => m.elo_rating ?? 1000)) : null
  const op = ((opRows as any[]) ?? []).reduce((a, r) => ({ games: a.games + (r.games ?? 0), wins: a.wins + (r.wins ?? 0), losses: a.losses + (r.losses ?? 0) }), { games: 0, wins: 0, losses: 0 })
  const winRate = op.wins + op.losses > 0 ? Math.round((op.wins / (op.wins + op.losses)) * 100) : null
  const recentGames = ((historyRaw as any[]) ?? []).slice(0, 4)

  const stats = [
    { label: 'Leagues', value: String(leagueCount), sub: leagueCount ? 'you compete in' : 'join or create one', icon: Users },
    { label: 'Best ELO', value: bestElo != null ? formatElo(bestElo) : '—', sub: 'across your leagues', icon: Trophy },
    { label: 'Open Play games', value: String(op.games), sub: `${op.wins}W – ${op.losses}L`, icon: Swords },
    { label: 'Win rate', value: winRate != null ? `${winRate}%` : '—', sub: 'open play, all time', icon: Percent },
  ]

  const soloModeLabel: Record<string, string> = {
    balanced: 'Drop-in', skill: 'Skill-separated', mixed: 'Mixed Doubles', ladder: 'King of the Court',
    king: 'King of the Court', americano: 'Americano', mexicano: 'Mexicano', skill_courts: 'Skill Courts',
  }
  const roleLabels: Record<string, string> = {
    head_admin: 'Head Admin', admin: 'Admin', officiator: 'Officiator', player: 'Player',
  }
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  return (
    <div>
      <ProfileCompletionBanner />

      {/* Greeting + primary actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome back, {firstName}</h1>
          <p className="text-muted-foreground mt-1">Here&apos;s what&apos;s happening in your pickleball world.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <JoinLeagueDialog />
          <CreateLeagueDialog />
        </div>
      </div>

      {/* Headline stats */}
      <FadeInStagger className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {stats.map(s => (
          <FadeInItem key={s.label}>
            <Card className="h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                  <s.icon className="w-4 h-4 text-muted-foreground/60" />
                </div>
                <div className="text-2xl font-bold text-foreground tabular-nums">{s.value}</div>
                <p className="text-xs text-muted-foreground/80 mt-0.5">{s.sub}</p>
              </CardContent>
            </Card>
          </FadeInItem>
        ))}
      </FadeInStagger>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Left: leagues + open play */}
        <div className="lg:col-span-2 space-y-10">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" />Your leagues</h2>
              <Link href="/elo" className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-primary transition-colors">
                <TrendingUp className="w-3.5 h-3.5" />How ELO works
              </Link>
            </div>

            {(!memberships || memberships.length === 0) ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trophy className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">No leagues yet</h3>
                  <p className="text-sm text-muted-foreground mb-5">Create a new league or join one with an invite code.</p>
                  <div className="flex gap-3 justify-center">
                    <JoinLeagueDialog />
                    <CreateLeagueDialog />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {memberships.map((m: any) => (
                  <Link key={m.id} href={`/leagues/${m.league_id}`} className="group">
                    <div className="rounded-2xl overflow-hidden border bg-card shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all h-full">
                      <div className="relative h-24 p-4 flex items-end bg-zinc-900">
                        <div className="absolute inset-0" style={{ backgroundColor: m.leagues.banner_color, opacity: 0.85 }} />
                        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 14px)' }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                        <Badge variant="secondary" className="absolute top-3 right-3 shrink-0 text-[9px] font-bold uppercase tracking-widest bg-white/15 text-white border-white/25 backdrop-blur-sm">
                          {roleLabels[m.role] ?? m.role}
                        </Badge>
                        <h3 className="relative text-white font-extrabold italic uppercase text-lg leading-none tracking-tight drop-shadow-sm line-clamp-2">{m.leagues.name}</h3>
                      </div>
                      <div className="p-4">
                        {m.leagues.location && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                            <MapPin className="w-3 h-3" />
                            {m.leagues.location}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1.5 text-foreground/90">
                            <Trophy className="w-4 h-4 text-primary" />
                            <span className="font-bold">{formatElo(m.elo_rating)}</span>
                            <span className="text-muted-foreground/80 text-xs">ELO</span>
                          </div>
                          <div className="text-muted-foreground text-xs font-medium">
                            {m.wins}W – {m.losses}L
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Swords className="w-4 h-4 text-primary" />Open Play</h2>
                <p className="text-muted-foreground text-sm mt-0.5">Run a drop-in session — no league or court needed.</p>
              </div>
              <Link href="/play/new" className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg px-4 py-2">
                <Plus className="w-4 h-4" />Start a session
              </Link>
            </div>

            {(!soloSessions || soloSessions.length === 0) && joinedSessions.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No live sessions right now.</p>
                  <p className="text-xs text-muted-foreground/80 mt-1">Start one and share the QR — players check in from their phones, no accounts needed.</p>
                </CardContent>
              </Card>
            )}

            {soloSessions && soloSessions.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {(soloSessions as any[]).map(s => (
                  <Link key={s.id} href={`/play/host/${s.manage_code}`} className="group">
                    <div className="rounded-xl border bg-card p-4 hover:border-foreground/25 hover:shadow-md transition-all h-full flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="relative flex h-2 w-2 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" /><span className="relative inline-flex rounded-full h-2 w-2 bg-primary" /></span>
                          <span className="font-semibold text-foreground truncate">{s.name}</span>
                          <span className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300 bg-violet-500/15 rounded-full px-2 py-0.5">{soloModeLabel[s.match_mode] ?? s.match_mode}</span>
                        </div>
                        <p className="text-xs text-muted-foreground/80 mt-0.5 capitalize">{s.format} · {s.court_count} court{s.court_count > 1 ? 's' : ''}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-primary text-sm font-medium shrink-0"><Play className="w-3.5 h-3.5" />Resume</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {joinedSessions.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-foreground/90 mb-2">Sessions you&apos;ve joined</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {joinedSessions.map(s => (
                    <Link key={s.session_id} href={`/play/${s.share_code}`} className="group">
                      <div className="rounded-xl border bg-card p-4 hover:border-foreground/25 hover:shadow-md transition-all h-full flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground truncate">{s.name}</span>
                            <span className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300 bg-violet-500/15 rounded-full px-2 py-0.5">{soloModeLabel[s.match_mode] ?? s.match_mode}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/80 mt-0.5">
                            {s.league_name ?? 'Standalone'} · {s.my_status === 'playing' ? 'on a court now' : s.my_status === 'resting' ? 'resting' : 'in the queue'}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-primary text-sm font-medium shrink-0"><Play className="w-3.5 h-3.5" />View</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right: recent games */}
        <FadeIn>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5"><History className="w-4 h-4 text-primary" />Recent games</h2>
                <Link href="/play/host?tab=history" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-0.5">View all<ArrowRight className="w-3 h-3" /></Link>
              </div>
              {recentGames.length === 0 ? (
                <p className="text-sm text-muted-foreground/80 py-6 text-center">
                  Your Open Play results will show up here once you&apos;ve played.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {recentGames.map((s: any) => (
                    <div key={s.session_id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                        <span className="text-sm font-bold tabular-nums text-foreground shrink-0">{s.wins}–{s.losses}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground/80 mt-0.5">
                        <span>{fmtDate(s.started_at)} · {s.league_name ?? 'Standalone'}</span>
                        <span>{s.points} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>
    </div>
  )
}
