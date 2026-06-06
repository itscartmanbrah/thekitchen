import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { LeagueLeaderboard } from '@/components/leagues/league-leaderboard'
import { LeagueMatches } from '@/components/leagues/league-matches'
import { LeagueMembers } from '@/components/leagues/league-members'
import { LeagueSettings } from '@/components/leagues/league-settings'
import { MapPin } from 'lucide-react'
import { CopyInviteButton } from '@/components/leagues/copy-invite-button'
import type { League, LeagueMember } from '@/types/database'

export default async function LeaguePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: leagueData } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', params.id)
    .single()

  const league = leagueData as unknown as League
  if (!league) notFound()

  const { data: membershipData } = await supabase
    .from('league_members')
    .select('*')
    .eq('league_id', params.id)
    .eq('user_id', user.id)
    .single()

  const membership = membershipData as unknown as LeagueMember
  if (!membership) redirect('/dashboard')

  const isAdmin = membership.role === 'head_admin' || membership.role === 'admin'
  const isHeadAdmin = membership.role === 'head_admin'

  const roleLabels: Record<string, string> = {
    head_admin: 'Head Admin',
    admin: 'Admin',
    officiator: 'Officiator',
    player: 'Player',
  }

  return (
    <div>
      {/* League header */}
      <div className="mb-6">
        <div
          className="h-3 rounded-lg mb-4"
          style={{ backgroundColor: league.banner_color }}
        />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
              <Badge variant="outline">{roleLabels[membership.role]}</Badge>
            </div>
            {league.description && (
              <p className="text-gray-600 mb-1">{league.description}</p>
            )}
            {league.location && (
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <MapPin className="w-3.5 h-3.5" />
                {league.location}
              </div>
            )}
          </div>
          <CopyInviteButton inviteCode={league.invite_code} />
        </div>
      </div>

      <Tabs defaultValue="leaderboard">
        <TabsList className="mb-6">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          {isAdmin && <TabsTrigger value="settings">Settings</TabsTrigger>}
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

        <TabsContent value="members">
          <LeagueMembers
            leagueId={params.id}
            currentUserId={user.id}
            isAdmin={isAdmin}
            isHeadAdmin={isHeadAdmin}
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="settings">
            <LeagueSettings league={league} isHeadAdmin={isHeadAdmin} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
