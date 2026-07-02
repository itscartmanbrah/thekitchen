'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, Trophy, Swords, Megaphone, Check, CheckCircle, XCircle, AlertCircle, CalendarClock } from 'lucide-react'

interface Notification {
  id: string
  title: string
  body: string | null
  type: string
  data: any
  read: boolean
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function NotifIcon({ type }: { type: string }) {
  if (type === 'match_scheduled')    return <Swords className="w-4 h-4 text-green-600" />
  if (type === 'match_result')       return <Trophy className="w-4 h-4 text-yellow-500" />
  if (type === 'league_announcement') return <Megaphone className="w-4 h-4 text-blue-500" />
  if (type === 'league_invite')      return <Bell className="w-4 h-4 text-green-500" />
  if (type === 'challenge_officiate') return <Swords className="w-4 h-4 text-orange-500" />
  if (type === 'challenge_received') return <Swords className="w-4 h-4 text-red-500" />
  if (type === 'court_booking')      return <CalendarClock className="w-4 h-4 text-green-600" />
  if (type === 'court_cancellation') return <CalendarClock className="w-4 h-4 text-red-500" />
  if (type === 'booking_request')    return <CalendarClock className="w-4 h-4 text-blue-500" />
  if (type === 'booking_approved')   return <CheckCircle className="w-4 h-4 text-green-600" />
  if (type === 'booking_rejected')   return <XCircle className="w-4 h-4 text-red-500" />
  return <Bell className="w-4 h-4 text-muted-foreground/80" />
}

export function NotificationsBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [inviteLoading, setInviteLoading]       = useState<Record<string, 'accept' | 'decline' | null>>({})
  const [challengeLoading, setChallengeLoading] = useState<Record<string, 'accept' | 'decline' | null>>({})
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const unread = notifications.filter(n => !n.read).length

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications((data as Notification[]) ?? [])
  }

  async function markAllRead() {
    // Keep action-required notifications unread until the user acts on them
    const actionTypes = ['league_invite', 'challenge_officiate', 'challenge_received']
    const unreadIds = notifications
      .filter(n => !n.read && !actionTypes.includes(n.type))
      .map(n => n.id)
    if (!unreadIds.length) return
    await supabase.from('notifications').update({ read: true } as any).in('id', unreadIds)
    setNotifications(prev => prev.map(n =>
      unreadIds.includes(n.id) ? { ...n, read: true } : n
    ))
  }

  async function markOneRead(id: string) {
    await supabase.from('notifications').update({ read: true } as any).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function clearAll() {
    await supabase.from('notifications').delete().eq('user_id', userId)
    setNotifications([])
  }

  async function acceptInvite(n: Notification) {
    const leagueId = n.data?.league_id
    if (!leagueId) return
    setInviteLoading(prev => ({ ...prev, [n.id]: 'accept' }))

    const { error } = await supabase
      .from('league_members')
      .update({ status: 'active' } as any)
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .eq('status', 'invited')

    if (error) {
      setInviteLoading(prev => ({ ...prev, [n.id]: null }))
      return
    }

    // Notify admins
    const { data: admins } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
      .in('role', ['head_admin', 'admin'])
      .eq('status', 'active')

    const { data: profile } = await supabase
      .from('profiles').select('display_name').eq('id', userId).single()

    const { data: leagueData } = await supabase
      .from('leagues').select('name').eq('id', leagueId).single()

    if (admins && admins.length > 0) {
      await supabase.from('notifications').insert(
        admins.map((a: any) => ({
          user_id: a.user_id,
          type: 'invite_accepted',
          title: '✅ Invite accepted',
          body: `${(profile as any)?.display_name ?? 'A player'} accepted their invitation to join ${(leagueData as any)?.name ?? 'your league'}.`,
          data: { league_id: leagueId },
        })) as any
      )
    }

    // Mark notification read and remove it
    await supabase.from('notifications').delete().eq('id', n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    setInviteLoading(prev => ({ ...prev, [n.id]: null }))
    setOpen(false)
    router.push(`/leagues/${leagueId}`)
    router.refresh()
  }

  async function declineInvite(n: Notification) {
    const leagueId = n.data?.league_id
    if (!leagueId) return
    setInviteLoading(prev => ({ ...prev, [n.id]: 'decline' }))

    await supabase
      .from('league_members')
      .delete()
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .eq('status', 'invited')

    // Notify admins
    const { data: admins } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
      .in('role', ['head_admin', 'admin'])
      .eq('status', 'active')

    const { data: profile } = await supabase
      .from('profiles').select('display_name').eq('id', userId).single()

    const { data: leagueData } = await supabase
      .from('leagues').select('name').eq('id', leagueId).single()

    if (admins && admins.length > 0) {
      await supabase.from('notifications').insert(
        admins.map((a: any) => ({
          user_id: a.user_id,
          type: 'invite_declined',
          title: '❌ Invite declined',
          body: `${(profile as any)?.display_name ?? 'A player'} declined their invitation to join ${(leagueData as any)?.name ?? 'your league'}.`,
          data: { league_id: leagueId },
        })) as any
      )
    }

    await supabase.from('notifications').delete().eq('id', n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    setInviteLoading(prev => ({ ...prev, [n.id]: null }))
  }

  // ── Challenge: officiator accepts ───────────────────────────────────────────
  async function acceptOfficiate(n: Notification) {
    const { challenge_id, league_id, challenger_id, challenger_name, challenged_id, challenged_name, format } = n.data ?? {}
    if (!challenge_id) return
    setChallengeLoading(prev => ({ ...prev, [n.id]: 'accept' }))

    await supabase.from('challenges').update({ status: 'pending_player' } as any).eq('id', challenge_id)

    // Notify the challenged player
    await supabase.from('notifications').insert({
      user_id: challenged_id,
      type:    'challenge_received',
      title:   '⚔️ You have been challenged!',
      body:    `${challenger_name} has challenged you to a ${format} match. An officiator is already confirmed.`,
      data: { challenge_id, league_id, challenger_id, challenger_name, format },
    } as any)

    await supabase.from('notifications').delete().eq('id', n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    setChallengeLoading(prev => ({ ...prev, [n.id]: null }))
  }

  async function declineOfficiate(n: Notification) {
    const { challenge_id, league_id, challenger_id, challenger_name, challenged_name } = n.data ?? {}
    if (!challenge_id) return
    setChallengeLoading(prev => ({ ...prev, [n.id]: 'decline' }))

    await supabase.from('challenges').update({ status: 'declined_officiator' } as any).eq('id', challenge_id)

    // Notify the challenger
    await supabase.from('notifications').insert({
      user_id: challenger_id,
      type:    'challenge_update',
      title:   'Officiating request declined',
      body:    `The officiator declined your challenge vs ${challenged_name}. Try selecting a different officiator.`,
      data:    { challenge_id, league_id },
    } as any)

    await supabase.from('notifications').delete().eq('id', n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    setChallengeLoading(prev => ({ ...prev, [n.id]: null }))
  }

  // ── Challenge: challenged player accepts ─────────────────────────────────
  async function acceptChallenge(n: Notification) {
    const { challenge_id, league_id, challenger_id } = n.data ?? {}
    if (!challenge_id) return
    setChallengeLoading(prev => ({ ...prev, [n.id]: 'accept' }))

    // Use a security definer RPC so a regular player can create the match
    const { data: matchId, error } = await supabase
      .rpc('accept_challenge', { p_challenge_id: challenge_id })

    if (error || !matchId) {
      setChallengeLoading(prev => ({ ...prev, [n.id]: null }))
      // Show error in bell panel
      setNotifications(prev => prev.map(x =>
        x.id === n.id ? { ...x, body: `Failed to accept: ${error?.message ?? 'unknown error'}` } : x
      ))
      return
    }

    // Notify the challenger
    const { data: myProfile } = await supabase
      .from('profiles').select('display_name').eq('id', userId).single()

    await supabase.from('notifications').insert({
      user_id: challenger_id,
      type:    'challenge_update',
      title:   '✅ Challenge accepted!',
      body:    `${(myProfile as any)?.display_name ?? 'Your opponent'} accepted your challenge. The match has been scheduled.`,
      data:    { challenge_id, league_id, match_id: matchId },
    } as any)

    await supabase.from('notifications').delete().eq('id', n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    setChallengeLoading(prev => ({ ...prev, [n.id]: null }))
    setOpen(false)
    router.push(`/leagues/${league_id}`)
    router.refresh()
  }

  async function declineChallenge(n: Notification) {
    const { challenge_id, league_id, challenger_id, challenger_name } = n.data ?? {}
    if (!challenge_id) return
    setChallengeLoading(prev => ({ ...prev, [n.id]: 'decline' }))

    await supabase.from('challenges').update({ status: 'declined_player' } as any).eq('id', challenge_id)

    // Notify challenger
    const { data: myProfile } = await supabase.from('profiles').select('display_name').eq('id', userId).single()
    await supabase.from('notifications').insert({
      user_id: challenger_id,
      type:    'challenge_update',
      title:   'Challenge declined',
      body:    `${(myProfile as any)?.display_name ?? 'Your opponent'} declined your challenge.`,
      data:    { challenge_id, league_id },
    } as any)

    await supabase.from('notifications').delete().eq('id', n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    setChallengeLoading(prev => ({ ...prev, [n.id]: null }))
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Initial fetch + realtime
  useEffect(() => {
    fetchNotifications()
    // Live updates via realtime…
    const ch = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => fetchNotifications())
      .subscribe()
    // …plus a polling fallback so new notifications still appear without a
    // reload even if the realtime connection is unavailable.
    const poll = setInterval(fetchNotifications, 30000)
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [userId])

  // Mark non-invite notifications read when dropdown opens
  useEffect(() => {
    if (open) markAllRead()
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-semibold text-sm text-foreground">Notifications</span>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <>
                  <button onClick={markAllRead} className="text-xs text-muted-foreground/80 hover:text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                  <span className="text-gray-200">|</span>
                  <button onClick={clearAll} className="text-xs text-muted-foreground/80 hover:text-red-500">
                    Clear all
                  </button>
                </>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground/80 text-sm">
                <Bell className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
                No notifications yet
              </div>
            ) : notifications.map(n => (
              <div
                key={n.id}
                className={`px-4 py-3 flex items-start gap-3 ${!n.read ? 'bg-green-50/60' : ''}`}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <NotifIcon type={n.type} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
                      {n.title}
                    </p>
                    {!n.read && n.type !== 'league_invite' && (
                      <span className="w-2 h-2 bg-green-500 rounded-full shrink-0 mt-1" />
                    )}
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>}
                  <p className="text-xs text-muted-foreground/80 mt-1">{timeAgo(n.created_at)}</p>

                  {/* League invite: Accept / Decline */}
                  {n.type === 'league_invite' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => acceptInvite(n)}
                        disabled={!!inviteLoading[n.id]}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {inviteLoading[n.id] === 'accept' ? 'Accepting…' : 'Accept'}
                      </button>
                      <button
                        onClick={() => declineInvite(n)}
                        disabled={!!inviteLoading[n.id]}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3" />
                        {inviteLoading[n.id] === 'decline' ? 'Declining…' : 'Decline'}
                      </button>
                    </div>
                  )}

                  {/* Challenge officiate request: Accept / Decline */}
                  {n.type === 'challenge_officiate' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => acceptOfficiate(n)}
                        disabled={!!challengeLoading[n.id]}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {challengeLoading[n.id] === 'accept' ? 'Accepting…' : 'Accept officiating'}
                      </button>
                      <button
                        onClick={() => declineOfficiate(n)}
                        disabled={!!challengeLoading[n.id]}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3" />
                        {challengeLoading[n.id] === 'decline' ? 'Declining…' : 'Decline'}
                      </button>
                    </div>
                  )}

                  {/* Challenge received: Accept / Decline */}
                  {n.type === 'challenge_received' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => acceptChallenge(n)}
                        disabled={!!challengeLoading[n.id]}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {challengeLoading[n.id] === 'accept' ? 'Accepting…' : 'Accept challenge'}
                      </button>
                      <button
                        onClick={() => declineChallenge(n)}
                        disabled={!!challengeLoading[n.id]}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3" />
                        {challengeLoading[n.id] === 'decline' ? 'Declining…' : 'Decline'}
                      </button>
                    </div>
                  )}

                  {/* Regular notifications: mark read */}
                  {!['league_invite', 'challenge_officiate', 'challenge_received'].includes(n.type) && !n.read && (
                    <button onClick={() => markOneRead(n.id)} className="text-xs text-muted-foreground/80 hover:text-muted-foreground mt-1">
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
