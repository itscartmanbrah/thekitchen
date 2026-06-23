import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { CreateLeagueDialog } from '@/components/leagues/create-league-dialog'
import { JoinLeagueDialog } from '@/components/leagues/join-league-dialog'
import { ProfileCompletionBanner } from '@/components/profile-completion-banner'
import { formatElo } from '@/lib/utils'
import { Trophy, MapPin, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('league_members')
    .select(`
      *,
      leagues (*)
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  const roleLabels: Record<string, string> = {
    head_admin: 'Head Admin',
    admin: 'Admin',
    officiator: 'Officiator',
    player: 'Player',
  }

  return (
    <div>
      <ProfileCompletionBanner />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Leagues</h1>
          <p className="text-gray-600 mt-1">Manage your pickleball leagues and track rankings.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <JoinLeagueDialog />
          <CreateLeagueDialog />
        </div>
      </div>

      {/* ELO transparency link */}
      <Link href="/elo" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-green-600 transition-colors mb-6">
        <TrendingUp className="w-3.5 h-3.5" />
        How ELO rankings are calculated
      </Link>

      {(!memberships || memberships.length === 0) ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No leagues yet</h2>
          <p className="text-gray-600 mb-6">Create a new league or join one with an invite code.</p>
          <div className="flex gap-3 justify-center">
            <JoinLeagueDialog />
            <CreateLeagueDialog />
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {memberships.map((m: any) => (
            <Link key={m.id} href={`/leagues/${m.league_id}`} className="group">
              <div className="rounded-2xl overflow-hidden border bg-white shadow-sm hover:shadow-lg transition-shadow h-full">
                {/* Athletic jersey banner */}
                <div className="relative h-24 p-4 flex items-end bg-slate-900">
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
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <MapPin className="w-3 h-3" />
                      {m.leagues.location}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-gray-700">
                      <Trophy className="w-4 h-4 text-green-600" />
                      <span className="font-bold">{formatElo(m.elo_rating)}</span>
                      <span className="text-gray-400 text-xs">ELO</span>
                    </div>
                    <div className="text-gray-500 text-xs font-medium">
                      {m.wins}W – {m.losses}L
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
