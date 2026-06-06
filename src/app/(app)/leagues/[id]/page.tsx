import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { LeagueLeaderboard } from '@/components/leagues/league-leaderboard'
import { LeagueMatches } from '@/components/leagues/league-matches'
import { LeagueMembers } from '@/components/leagues/league-members'
import { LeagueSettings } from '@/components/leagues/league-settings'
import { LeagueActivity } from '@/components/leagues/league-activity'
import { LeagueStats } from '@/components/leagues/league-stats'
import { LeagueAnnouncements } from '@/components/leagues/league-announcements'
import { LeagueWaitlist } from '@/components/leagues/league-waitlist'
import { LeagueInviteLinks } from '@/components/leagues/league-invite-links'
import { MapPin } from 'lucide-react'
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

  const isAdmin = membership.role === 'head_admin' || membership.role === 'admin'
  const isHeadAdmin = membership.role === 'head_admin'

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
      {/* League header */}
      <div className="mb-5">
        <div className="h-3 rounded-lg mb-4" style={{ backgroundColor: league.banner_color }} />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
              <Badge variant="outline">{roleLabels[membership.role]}</Badge>
            </div>
            {league.description && <p className="text-gray-600 mb-1">{league.description}</p>}
            {league.location && (
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <MapPin className="w-3.5 h-3.5" />{league.location}
              </div>
            )}
          </div>
          <CopyInviteButton inviteCode={league.invite_code} />
        </div>
      </div>

      {/* Announcements (always visible above tabs) */}
      <LeagueAnnouncements leagueId={params.id} isAdmin={isAdmin} />

      <Tabs defaultValue="leaderboard">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="settings" className="relative">
              Settings
              {(pendingCount ?? 0) > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="leaderboard">
          <LeagueLeaderboard leagueId={params.id} currentUserId={user.id} />
        </TabsContent>

        <TabsContent value="matches">
          <LeagueMatches
            leagueId={params.id}
            currentUserId={user.id}
            isAdmin={isAdmin}
            isOfficiator={membership.role === 'officiator'}
            membership={membership}
          />
        </TabsContent>

        <TabsContent value="activity">
          <LeagueActivity leagueId={params.id} />
        </TabsContent>

        <TabsContent value="stats">
          <LeagueStats leagueId={params.id} />
        </TabsContent>

        <TabsContent value="members">
          <LeagueMembers
            leagueId={params.id}
            currentUserId={user.id}
            isAdmin={isAdmin}
            isHeadAdmin={isHeadAdmin}
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="settings" className="space-y-6">
            <LeagueSettings league={league} isHeadAdmin={isHeadAdmin} />

            {/* Invite links */}
            <div className="max-w-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Invite links</h3>
              <LeagueInviteLinks leagueId={params.id} />
            </div>

            {/* Waitlist */}
            {(pendingCount ?? 0) > 0 && (
              <div className="max-w-lg">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  Join requests
                  <span className="bg-red-100 text-red-600 text-xs font-bold rounded-full px-2 py-0.5">
                    {pendingCount}
                  </span>
                </h3>
                <LeagueWaitlist leagueId={params.id} />
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
