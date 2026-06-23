'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { CountUp } from '@/components/ui/count-up'
import { PlayerAvatar } from '@/components/player-avatar'
import { getPickleballRating } from '@/lib/utils'
import {
  Swords, CalendarClock, Trophy, ChevronRight, Inbox, CheckCircle2,
} from 'lucide-react'

interface Props {
  leagueId: string
  currentUserId: string
  isAdmin: boolean
  onNavigate: (leaf: any) => void
}

interface Standing { rank: number; total: number; elo: number; wins: number; losses: number }
interface OpenPlay { id: string; name: string; status: 'live' | 'scheduled'; starts_at: string | null }
interface NextBooking { court: string; starts_at: string }
interface RecentMatch { id: string; t1: number; t2: number; format: string; when: string; mine: 'W' | 'L' | null }

function relTime(iso: string) {
  const d = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(d)
  const mins = Math.round(abs / 60000)
  const hrs = Math.round(abs / 3600000)
  const days = Math.round(abs / 86400000)
  const s = mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`
  return d < 0 ? `${s} ago` : `in ${s}`
}

function Kpi({ label, children, gradient }: { label: string; children: React.ReactNode; gradient: string }) {
  return (
    <div className={`rounded-2xl px-4 py-3.5 text-white shadow-md bg-gradient-to-br ${gradient}`}>
      <p className="text-xs text-white/80">{label}</p>
      <div className="text-2xl font-bold mt-0.5">{children}</div>
    </div>
  )
}

const fmtLabels: Record<string, string> = { singles: 'Singles', doubles: 'Doubles', mixed_doubles: 'Mixed', round_robin: 'Round Robin' }

export function LeagueOverview({ leagueId, currentUserId, isAdmin, onNavigate }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [standing, setStanding] = useState<Standing | null>(null)
  const [openPlay, setOpenPlay] = useState<OpenPlay | null>(null)
  const [nextBooking, setNextBooking] = useState<NextBooking | null>(null)
  const [recent, setRecent] = useState<RecentMatch[]>([])
  const [pendingReq, setPendingReq] = useState(0)
  const [pendingBookings, setPendingBookings] = useState(0)

  useEffect(() => {
    let alive = true
    async function load() {
      const nowIso = new Date().toISOString()

      const [membersRes, opRes, bookRes, matchRes] = await Promise.all([
        supabase.from('league_members').select('user_id, elo_rating, wins, losses')
          .eq('league_id', leagueId).eq('status', 'active').order('elo_rating', { ascending: false }),
        supabase.from('play_sessions').select('id, name, status, starts_at, ended_at, ends_at')
          .eq('league_id', leagueId).is('ended_at', null).order('starts_at', { ascending: true }).limit(5),
        supabase.from('court_bookings').select('starts_at, status, courts(name)')
          .eq('league_id', leagueId).eq('user_id', currentUserId).in('status', ['pending', 'booked'])
          .gte('starts_at', nowIso).order('starts_at', { ascending: true }).limit(1),
        supabase.from('matches').select('id, team1_score, team2_score, format, completed_at, match_players(user_id, team)')
          .eq('league_id', leagueId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(3),
      ])

      if (!alive) return

      const members = (membersRes.data ?? []) as any[]
      const myIdx = members.findIndex(m => m.user_id === currentUserId)
      if (myIdx >= 0) {
        const me = members[myIdx]
        setStanding({ rank: myIdx + 1, total: members.length, elo: me.elo_rating, wins: me.wins ?? 0, losses: me.losses ?? 0 })
      }

      const sessions = (opRes.data ?? []) as any[]
      const live = sessions.find(s => (!s.ends_at || new Date(s.ends_at) > new Date()) && (!s.starts_at || new Date(s.starts_at) <= new Date()))
      const sched = sessions.find(s => s.starts_at && new Date(s.starts_at) > new Date())
      if (live) setOpenPlay({ id: live.id, name: live.name, status: 'live', starts_at: live.starts_at })
      else if (sched) setOpenPlay({ id: sched.id, name: sched.name, status: 'scheduled', starts_at: sched.starts_at })

      const bk = (bookRes.data ?? []) as any[]
      if (bk[0]) setNextBooking({ court: bk[0].courts?.name ?? 'Court', starts_at: bk[0].starts_at })

      const matches = (matchRes.data ?? []) as any[]
      setRecent(matches.map(m => {
        const mp = (m.match_players ?? []).find((p: any) => p.user_id === currentUserId)
        let mine: 'W' | 'L' | null = null
        if (mp) {
          const won = mp.team === 1 ? m.team1_score > m.team2_score : m.team2_score > m.team1_score
          mine = won ? 'W' : 'L'
        }
        return { id: m.id, t1: m.team1_score, t2: m.team2_score, format: m.format, when: m.completed_at, mine }
      }))

      if (isAdmin) {
        const [pr, pb] = await Promise.all([
          supabase.from('league_members').select('*', { count: 'exact', head: true }).eq('league_id', leagueId).eq('status', 'pending'),
          supabase.from('court_bookings').select('*', { count: 'exact', head: true }).eq('league_id', leagueId).eq('status', 'pending'),
        ])
        if (!alive) return
        setPendingReq(pr.count ?? 0)
        setPendingBookings(pb.count ?? 0)
      }
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [leagueId, currentUserId, isAdmin])

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading overview…</div>

  const pb = standing ? getPickleballRating(standing.elo) : null
  const winRate = standing && standing.wins + standing.losses > 0
    ? Math.round((standing.wins / (standing.wins + standing.losses)) * 100) : null

  const item = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.05, duration: 0.35 } })

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      {standing && (
        <motion.div {...item(0)} className="grid grid-cols-3 gap-3">
          <Kpi label="Your rank" gradient="from-green-500 to-emerald-600">
            #<CountUp value={standing.rank} />
            <span className="text-sm text-white/80 font-normal"> of {standing.total}</span>
          </Kpi>
          <Kpi label="Your rating" gradient="from-violet-500 to-purple-600">
            {pb && <CountUp value={parseFloat(pb.rating)} decimals={2} />}
          </Kpi>
          <Kpi label="Win rate" gradient="from-amber-500 to-orange-600">
            {winRate !== null ? <CountUp value={winRate} suffix="%" /> : <span className="text-white/70 text-lg">—</span>}
            <span className="block text-xs text-white/80 font-normal">{standing.wins}W · {standing.losses}L</span>
          </Kpi>
        </motion.div>
      )}

      {/* Open Play + Next booking */}
      <div className="grid sm:grid-cols-2 gap-3">
        <motion.button {...item(1)} onClick={() => onNavigate('open-play')}
          className="text-left rounded-xl border bg-white p-4 hover:border-green-300 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><Swords className="w-4 h-4 text-green-600" />Open Play</span>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-green-500" />
          </div>
          {openPlay ? (
            <div>
              {openPlay.status === 'live' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />LIVE NOW
                </span>
              ) : (
                <span className="text-xs font-semibold text-blue-600">SCHEDULED {openPlay.starts_at && relTime(openPlay.starts_at)}</span>
              )}
              <p className="text-sm text-gray-900 mt-1 truncate">{openPlay.name}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No sessions running. Tap to start one.</p>
          )}
        </motion.button>

        <motion.button {...item(2)} onClick={() => onNavigate('bookings')}
          className="text-left rounded-xl border bg-white p-4 hover:border-green-300 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><CalendarClock className="w-4 h-4 text-green-600" />Your next booking</span>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-green-500" />
          </div>
          {nextBooking ? (
            <div>
              <p className="text-sm text-gray-900">{nextBooking.court}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {new Date(nextBooking.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                <span className="text-gray-400"> · {relTime(nextBooking.starts_at)}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Nothing booked. Tap to reserve a court.</p>
          )}
        </motion.button>
      </div>

      {/* Recent matches */}
      <motion.div {...item(3)} className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><Trophy className="w-4 h-4 text-green-600" />Recent matches</span>
          <button onClick={() => onNavigate('matches')} className="text-xs text-gray-400 hover:text-green-600">View all</button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">No matches played yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map(m => (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-gray-400 w-14 shrink-0">{fmtLabels[m.format] ?? m.format}</span>
                <span className="font-medium text-gray-800">{m.t1}–{m.t2}</span>
                {m.mine && (
                  <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${m.mine === 'W' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {m.mine === 'W' ? 'WON' : 'LOST'}
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-400">{relTime(m.when)}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Admin strip */}
      {isAdmin && (pendingReq > 0 || pendingBookings > 0) && (
        <motion.div {...item(4)} className="grid sm:grid-cols-2 gap-3">
          {pendingReq > 0 && (
            <button onClick={() => onNavigate('requests')}
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100 transition-colors">
              <Inbox className="w-5 h-5 text-amber-600 shrink-0" />
              <div><p className="text-sm font-medium text-amber-900">{pendingReq} join request{pendingReq > 1 ? 's' : ''}</p><p className="text-xs text-amber-700">Tap to review</p></div>
            </button>
          )}
          {pendingBookings > 0 && (
            <button onClick={() => onNavigate('bookings')}
              className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left hover:bg-blue-100 transition-colors">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
              <div><p className="text-sm font-medium text-blue-900">{pendingBookings} booking request{pendingBookings > 1 ? 's' : ''}</p><p className="text-xs text-blue-700">Tap to approve</p></div>
            </button>
          )}
        </motion.div>
      )}
    </div>
  )
}
