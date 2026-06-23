'use client'

import { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Trophy, CalendarRange, Users, Settings,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { LeagueOverview } from '@/components/leagues/league-overview'
import { LeagueLeaderboard } from '@/components/leagues/league-leaderboard'
import { LeagueMatches } from '@/components/leagues/league-matches'
import { LeagueActivity } from '@/components/leagues/league-activity'
import { LeagueStats } from '@/components/leagues/league-stats'
import { LeagueMembers } from '@/components/leagues/league-members'
import { LeagueChallenges } from '@/components/leagues/league-challenges'
import { LeagueTournaments } from '@/components/leagues/league-tournaments'
import { LeagueCourts } from '@/components/leagues/league-courts'
import { LeagueBookings } from '@/components/leagues/league-bookings'
import { LeagueOpenPlay } from '@/components/leagues/league-open-play'
import { LeagueOfficiated } from '@/components/leagues/league-officiated'
import { LeagueWaitlist } from '@/components/leagues/league-waitlist'
import { LeagueSettings } from '@/components/leagues/league-settings'
import { LeagueSeasonManager } from '@/components/leagues/league-season-manager'
import { LeagueInviteLinks } from '@/components/leagues/league-invite-links'
import type { League } from '@/types/database'

type Leaf =
  | 'overview' | 'leaderboard' | 'matches' | 'challenges' | 'tournaments' | 'stats'
  | 'open-play' | 'book' | 'bookings' | 'members' | 'activity'
  | 'requests' | 'officiated' | 'settings'

interface NavProps {
  leagueId: string
  league: League
  currentUserId: string
  isAdmin: boolean
  isHeadAdmin: boolean
  isOfficiator: boolean
  activeSeason: { id: string; name: string; status: string } | null
  pendingCount: number
}

export function LeagueNav(props: NavProps) {
  const { leagueId, league, currentUserId, isAdmin, isHeadAdmin, isOfficiator, activeSeason, pendingCount } = props

  // Tab state is local so switching is instant — no server round-trip. We read
  // any deep-link (?v=) once on mount and reflect changes back into the URL with
  // history.replaceState, which doesn't trigger a Next navigation/re-render.
  const [active, setActive] = useState<Leaf>(() => {
    if (typeof window === 'undefined') return 'overview'
    return (new URLSearchParams(window.location.search).get('v') as Leaf) || 'overview'
  })

  // ── Group + sub definitions (role-filtered) ─────────────────────────────────
  const groups = useMemo(() => {
    const g: { key: string; label: string; icon: typeof Trophy; subs: { key: Leaf; label: string; badge?: number }[]; gear?: boolean }[] = [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard, subs: [] },
      {
        key: 'compete', label: 'Compete', icon: Trophy, subs: [
          { key: 'leaderboard', label: 'Leaderboard' },
          { key: 'matches', label: 'Matches' },
          { key: 'challenges', label: 'Challenges' },
          { key: 'tournaments', label: 'Tournaments' },
          { key: 'stats', label: 'Stats' },
        ],
      },
      {
        key: 'courts', label: 'Courts & Play', icon: CalendarRange, subs: [
          { key: 'open-play', label: 'Open Play' },
          { key: 'book', label: 'Book a Court' },
          { key: 'bookings', label: isAdmin ? 'Bookings' : 'My Bookings' },
        ],
      },
      {
        key: 'community', label: 'Community', icon: Users, subs: [
          { key: 'members', label: 'Members' },
          { key: 'activity', label: 'Activity' },
        ],
      },
    ]
    if (isAdmin || isOfficiator) {
      const manageSubs: { key: Leaf; label: string; badge?: number }[] = []
      if (isAdmin) manageSubs.push({ key: 'requests', label: 'Requests', badge: pendingCount })
      if (isOfficiator) manageSubs.push({ key: 'officiated', label: 'Officiated' })
      if (isAdmin) manageSubs.push({ key: 'settings', label: 'Settings' })
      g.push({ key: 'manage', label: 'Manage', icon: Settings, subs: manageSubs, gear: true })
    }
    return g
  }, [isAdmin, isOfficiator, pendingCount])

  const activeGroup = useMemo(
    () => groups.find(g => g.key === active || g.subs.some(s => s.key === active)) ?? groups[0],
    [groups, active],
  )

  const go = useCallback((leaf: Leaf) => {
    setActive(leaf)
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    if (leaf === 'overview') sp.delete('v')
    else sp.set('v', leaf)
    const qs = sp.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [])

  // Selecting a group jumps to its first sub (or the group itself for Overview)
  const selectGroup = useCallback((key: string) => {
    const grp = groups.find(g => g.key === key)
    if (!grp) return
    go(grp.subs[0]?.key ?? (key as Leaf))
  }, [groups, go])

  return (
    <div>
      {/* Tier 1 — groups (segmented pill bar) */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto p-1 bg-gray-100 rounded-xl">
        {groups.filter(g => !g.gear).map(g => {
          const on = activeGroup.key === g.key
          const Icon = g.icon
          return (
            <button
              key={g.key}
              onClick={() => selectGroup(g.key)}
              className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                on ? 'text-white font-semibold' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {on && <motion.div layoutId="grp-pill" className="absolute inset-0 bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-sm" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
              <Icon className="w-4 h-4 relative z-10" />
              <span className="relative z-10">{g.label}</span>
            </button>
          )
        })}

        {/* Gear (admin) pushed right */}
        {groups.find(g => g.gear) && (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    activeGroup.gear ? 'bg-gradient-to-br from-green-500 to-green-600 text-white font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Manage</span>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{pendingCount}</span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {groups.find(g => g.gear)!.subs.map(s => (
                  <DropdownMenuItem key={s.key} onClick={() => go(s.key)} className="flex items-center justify-between">
                    {s.label}
                    {!!s.badge && s.badge > 0 && (
                      <span className="bg-red-100 text-red-600 text-[10px] font-bold rounded-full px-1.5">{s.badge}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Tier 2 — sub-tabs of the active group */}
      {activeGroup.subs.length > 0 && !activeGroup.gear && (
        <div className="flex items-center gap-1 mb-5 overflow-x-auto">
          {activeGroup.subs.map(s => {
            const on = active === s.key
            return (
              <button
                key={s.key}
                onClick={() => go(s.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                  on ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {s.label}
                {!!s.badge && s.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{s.badge}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
        {active === 'overview' && (
          <LeagueOverview leagueId={leagueId} currentUserId={currentUserId} isAdmin={isAdmin} onNavigate={go} />
        )}
        {active === 'leaderboard' && (
          <LeagueLeaderboard leagueId={leagueId} currentUserId={currentUserId} activeSeason={activeSeason as any} />
        )}
        {active === 'matches' && (
          <LeagueMatches leagueId={leagueId} currentUserId={currentUserId} isAdmin={isAdmin} />
        )}
        {active === 'challenges' && (
          <LeagueChallenges leagueId={leagueId} currentUserId={currentUserId} />
        )}
        {active === 'tournaments' && (
          <LeagueTournaments leagueId={leagueId} currentUserId={currentUserId} isAdmin={isAdmin} canReport={isOfficiator} />
        )}
        {active === 'stats' && <LeagueStats leagueId={leagueId} />}
        {active === 'open-play' && <LeagueOpenPlay leagueId={leagueId} isOrganizer={isOfficiator} />}
        {active === 'book' && <LeagueCourts leagueId={leagueId} currentUserId={currentUserId} isAdmin={isAdmin} />}
        {active === 'bookings' && <LeagueBookings leagueId={leagueId} currentUserId={currentUserId} isAdmin={isAdmin} />}
        {active === 'members' && (
          <LeagueMembers leagueId={leagueId} currentUserId={currentUserId} isAdmin={isAdmin} isHeadAdmin={isHeadAdmin} />
        )}
        {active === 'activity' && <LeagueActivity leagueId={leagueId} />}

        {active === 'officiated' && isOfficiator && (
          <LeagueOfficiated leagueId={leagueId} currentUserId={currentUserId} />
        )}
        {active === 'requests' && isAdmin && (
          <div className="max-w-lg">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-semibold text-gray-900">Join requests</h2>
              {pendingCount > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold rounded-full px-2 py-0.5">{pendingCount} pending</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-4">Review players who have requested to join. Assign their role before approving.</p>
            <LeagueWaitlist leagueId={leagueId} />
          </div>
        )}
        {active === 'settings' && isAdmin && (
          <div className="space-y-6">
            <LeagueSettings league={league} isHeadAdmin={isHeadAdmin} />
            <LeagueSeasonManager leagueId={leagueId} currentUserId={currentUserId} />
            <div className="max-w-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Invite links</h3>
              <LeagueInviteLinks leagueId={leagueId} />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
