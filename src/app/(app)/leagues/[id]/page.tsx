import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LeagueAnnouncements } from '@/components/leagues/league-announcements'
import { LeagueInviteScreen } from '@/components/leagues/league-invite-screen'
import { LeagueNav } from '@/components/leagues/league-nav'
import { MapPin, ArrowLeft } from 'lucide-react'
import { CopyInviteButton } from '@/components/leagues/copy-invite-button'
import type { League, LeagueMember } from '@/types/database'

export default async function LeaguePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!user) return null // TypeScript narrowing — redirect() throws, this is unreachable

  const { data: leagueData } = await supabase.from('leagues').select('*').eq('id', params.id).single()
  const league = leagueData as unknown as League
  if (!league) notFound()

  const { data: membershipData } = await supabase
    .from('league_members').select('*').eq('league_id', params.id).eq('user_id', user.id).single()
  const membership = membershipData as unknown as LeagueMember
  if (!membership) redirect('/dashboard')

  // Block pending members from accessing the league
  if ((membership as any).status === 'pending') {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⏳</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Waiting for approval</h1>
        <p className="text-gray-500 text-sm">Your request to join <strong>{league.name}</strong> is pending. An admin will approve it soon.</p>
      </div>
    )
  }

  // Banned members are blocked entirely
  if ((membership as any).status === 'banned') {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🚫</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">You&apos;ve been banned from this league</h1>
        <p className="text-gray-500 text-sm">
          You no longer have access to <strong>{league.name}</strong>.
        </p>
        {(membership as any).ban_reason && (
          <p className="text-sm text-gray-500 mt-3 bg-gray-50 border rounded-lg px-4 py-3 italic">
            &ldquo;{(membership as any).ban_reason}&rdquo;
          </p>
        )}
        <p className="text-gray-400 text-xs mt-4">If you think this is a mistake, contact a league admin.</p>
      </div>
    )
  }

  // Show accept/decline screen for invited members
  if ((membership as any).status === 'invited') {
    return <LeagueInviteScreen league={league} membershipId={membership.id} userId={user.id} />
  }

  const isAdmin      = membership.role === 'head_admin' || membership.role === 'admin'
  const isHeadAdmin  = membership.role === 'head_admin'
  const isOfficiator = membership.role === 'officiator' || isAdmin

  // Active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, name, status')
    .eq('league_id', params.id)
    .eq('status', 'active')
    .single()

  // Pending count for admin badge
  const { count: pendingCount } = await supabase
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', params.id)
    .eq('status', 'pending')

  const roleLabels: Record<string, string> = {
    head_admin: 'Head Admin', admin: 'Admin', officiator: 'Officiator', player: 'Player',
  }

  return (
    <div>
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Leagues
      </Link>

      {/* League header — athletic scoreboard panel */}
      <div className="relative overflow-hidden rounded-2xl mb-6 shadow-lg bg-slate-900">
        {(league as any).banner_image_url && (
          <img src={(league as any).banner_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
        )}
        {/* diagonal jersey stripes */}
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 16px)' }} />
        {/* league-color accent edge */}
        <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: league.banner_color }} />
        <div className="relative p-6 sm:p-7 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/10 text-white border border-white/20 rounded px-2 py-0.5">
                {roleLabels[membership.role]}
              </span>
              {activeSeason && (
                <span className="text-[10px] font-bold uppercase tracking-widest rounded px-2 py-0.5 text-slate-900" style={{ backgroundColor: league.banner_color, color: '#fff' }}>
                  {activeSeason.name}
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold italic uppercase tracking-tight text-white leading-none">{league.name}</h1>
            <div className="h-1 w-12 rounded-full mt-3" style={{ backgroundColor: league.banner_color }} />
            {league.description && <p className="text-white/70 mt-3 max-w-xl">{league.description}</p>}
            {league.location && (
              <div className="flex items-center gap-1 text-sm text-white/60 mt-1.5">
                <MapPin className="w-3.5 h-3.5" />{league.location}
              </div>
            )}
          </div>
          <CopyInviteButton inviteCode={league.invite_code} onLight />
        </div>
      </div>

      {/* Announcements (always visible above the nav) */}
      <LeagueAnnouncements leagueId={params.id} isAdmin={isAdmin} />

      <LeagueNav
        leagueId={params.id}
        league={league}
        currentUserId={user.id}
        isAdmin={isAdmin}
        isHeadAdmin={isHeadAdmin}
        isOfficiator={isOfficiator}
        activeSeason={(activeSeason as any) ?? null}
        pendingCount={pendingCount ?? 0}
      />
    </div>
  )
}
