'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtime } from '@/lib/use-realtime'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { CalendarClock, MapPin, Clock, ChevronDown, ChevronUp, Phone } from 'lucide-react'

const CANCEL_WINDOW_MS = 2 * 60 * 60 * 1000

interface Row {
  id: string
  court_id: string
  user_id: string
  starts_at: string
  ends_at: string
  court_name: string
  is_indoor: boolean
  contact_phone: string | null
  display_name: string
  avatar_color: string
  avatar_url: string | null
  status?: string
}

interface Session {
  id: string
  court_id: string
  court_name: string
  contact_phone: string | null
  user_id: string
  display_name: string
  avatar_color: string
  avatar_url: string | null
  start: string
  end: string
  status: string
  bookings: Row[]
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtHourChip(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '')
}
function dayKey(iso: string) {
  const d = new Date(iso); d.setHours(0, 0, 0, 0); return d.toISOString()
}
function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(dayKey(iso)).getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

// Merge contiguous bookings (same court + same player, back-to-back hours) into sessions
function buildSessions(rows: Row[]): Session[] {
  const sorted = [...rows].sort((a, b) =>
    a.court_id.localeCompare(b.court_id) ||
    a.user_id.localeCompare(b.user_id) ||
    new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  )
  const sessions: Session[] = []
  for (const r of sorted) {
    const last = sessions[sessions.length - 1]
    if (last && last.court_id === r.court_id && last.user_id === r.user_id && last.status === (r.status ?? 'booked') &&
        new Date(last.end).getTime() === new Date(r.starts_at).getTime()) {
      last.end = r.ends_at
      last.bookings.push(r)
    } else {
      sessions.push({
        id: r.id, court_id: r.court_id, court_name: r.court_name, contact_phone: r.contact_phone,
        user_id: r.user_id, display_name: r.display_name,
        avatar_color: r.avatar_color, avatar_url: r.avatar_url,
        start: r.starts_at, end: r.ends_at, status: r.status ?? 'booked', bookings: [r],
      })
    }
  }
  return sessions.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

export function LeagueBookings({ leagueId, currentUserId, isAdmin }: { leagueId: string; currentUserId: string; isAdmin: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<Session | null>(null)
  const [contactTarget, setContactTarget] = useState<Session | null>(null)
  const [pending, setPending] = useState<Row[]>([])
  const [rejectTarget, setRejectTarget] = useState<Session | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const { toast } = useToast()
  const supabase = createClient()

  async function fetchPending() {
    if (!isAdmin) { setPending([]); return }
    const { data } = await supabase
      .from('court_bookings')
      .select('id, court_id, user_id, starts_at, ends_at, courts(name)')
      .eq('league_id', leagueId).eq('status', 'pending')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
    const raw = (data ?? []) as any[]
    const ids = Array.from(new Set(raw.map(r => r.user_id)))
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select('id, display_name, first_name, last_name, avatar_color, avatar_url').in('id', ids)
      : { data: [] }
    const pMap = new Map(((profs ?? []) as any[]).map(p => [p.id, p]))
    setPending(raw.map(r => {
      const p = pMap.get(r.user_id)
      const full = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim()
      return {
        id: r.id, court_id: r.court_id, user_id: r.user_id, starts_at: r.starts_at, ends_at: r.ends_at,
        court_name: r.courts?.name ?? 'Court', is_indoor: false, contact_phone: null,
        display_name: full || p?.display_name || 'Unknown',
        avatar_color: p?.avatar_color ?? '#2563eb', avatar_url: p?.avatar_url ?? null,
      }
    }))
  }

  async function approveRequest(s: Session) {
    const { error } = await supabase.rpc('approve_booking_request', { p_booking_ids: s.bookings.map(b => b.id) })
    if (error) toast({ title: 'Could not approve', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Booking approved' }); fetchPending(); fetchBookings() }
  }
  async function doReject() {
    if (!rejectTarget) return
    const { error } = await supabase.rpc('reject_booking_request', { p_booking_ids: rejectTarget.bookings.map(b => b.id), p_reason: rejectReason.trim() || null })
    if (error) toast({ title: 'Could not reject', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Booking declined' }); setRejectTarget(null); setRejectReason(''); fetchPending() }
  }

  async function fetchBookings() {
    setLoading(true)
    const nowIso = new Date().toISOString()
    let q = supabase
      .from('court_bookings')
      .select('id, court_id, user_id, starts_at, ends_at, status, courts(name, is_indoor, contact_phone)')
      .eq('league_id', leagueId)

    // Admins see confirmed bookings here (requests are handled above); members
    // see their own confirmed + pending requests.
    if (!isAdmin) q = q.eq('user_id', currentUserId).in('status', ['pending', 'booked'])
    else q = q.eq('status', 'booked')

    q = scope === 'upcoming'
      ? q.gte('starts_at', nowIso).order('starts_at', { ascending: true })
      : q.lt('starts_at', nowIso).order('starts_at', { ascending: false }).limit(200)

    const { data } = await q
    const raw = (data ?? []) as any[]

    const userIds = Array.from(new Set(raw.map(r => r.user_id)))
    const { data: profs } = userIds.length
      ? await supabase.from('profiles').select('id, display_name, first_name, last_name, avatar_color, avatar_url').in('id', userIds)
      : { data: [] }
    const pMap = new Map(((profs ?? []) as any[]).map(p => [p.id, p]))

    setRows(raw.map(r => {
      const p = pMap.get(r.user_id)
      const fullName = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim()
      return {
        id: r.id, court_id: r.court_id, user_id: r.user_id,
        starts_at: r.starts_at, ends_at: r.ends_at,
        court_name: r.courts?.name ?? 'Court', is_indoor: r.courts?.is_indoor ?? false,
        contact_phone: r.courts?.contact_phone ?? null, status: r.status,
        display_name: fullName || p?.display_name || 'Unknown',
        avatar_color: p?.avatar_color ?? '#2563eb', avatar_url: p?.avatar_url ?? null,
      }
    }))
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [leagueId, scope, isAdmin, currentUserId])
  useEffect(() => { fetchPending() }, [leagueId, isAdmin])

  // Live: refresh when any booking in this league changes.
  useRealtime(`bookings:${leagueId}`, [
    { table: 'court_bookings', filter: `league_id=eq.${leagueId}` },
  ], () => { fetchBookings(); if (isAdmin) fetchPending() }, [leagueId, isAdmin])

  const pendingSessions = buildSessions(pending)

  // Admins can cancel anytime; members only ≥2 hours before start
  function canCancel(s: Session) {
    return isAdmin || new Date(s.start).getTime() - Date.now() >= CANCEL_WINDOW_MS
  }

  function onCancelClick(s: Session) {
    if (canCancel(s)) setConfirmTarget(s)
    else setContactTarget(s)
  }

  // Cancel a single hour (one pill) from within a session
  function onHourClick(s: Session, b: Row) {
    const single: Session = { ...s, id: b.id, start: b.starts_at, end: b.ends_at, bookings: [b] }
    const cancellable = isAdmin || new Date(b.starts_at).getTime() - Date.now() >= CANCEL_WINDOW_MS
    if (cancellable) setConfirmTarget(single)
    else setContactTarget(single)
  }

  async function cancelSession(s: Session) {
    const { error } = await supabase.rpc('cancel_court_session', { p_booking_ids: s.bookings.map(b => b.id) })
    if (error) toast({ title: 'Could not cancel', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Booking cancelled' }); fetchBookings() }
    setConfirmTarget(null)
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sessions = buildSessions(rows)

  // Group sessions by day for the date headers
  const groups: { key: string; label: string; sessions: Session[] }[] = []
  for (const s of sessions) {
    const key = dayKey(s.start)
    let g = groups.find(x => x.key === key)
    if (!g) { g = { key, label: dayLabel(s.start), sessions: [] }; groups.push(g) }
    g.sessions.push(s)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-blue-400" />
          {isAdmin ? 'Court bookings' : 'My bookings'}
        </h2>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(['upcoming', 'past'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                scope === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground/90'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Pending requests (admins approve/reject) */}
      {isAdmin && pendingSessions.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">
            Booking requests ({pendingSessions.length})
          </p>
          <div className="space-y-1.5">
            {pendingSessions.map(s => (
              <div key={s.id} className="bg-blue-50/60 border border-blue-500/25 rounded-lg px-3 py-2.5 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/90 w-32 shrink-0">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground/80" />{fmtTime(s.start)}–{fmtTime(s.end)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <MapPin className="w-3 h-3 text-muted-foreground/80" />{s.court_name}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <PlayerAvatar name={s.display_name} color={s.avatar_color} imageUrl={s.avatar_url} size="xs" />
                  <span className="text-sm text-foreground truncate">{s.display_name}</span>
                  <span className="text-[10px] text-muted-foreground/80">{dayLabel(s.start)}</span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => approveRequest(s)}>Approve</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs text-red-600 dark:text-red-400" onClick={() => { setRejectTarget(s); setRejectReason('') }}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading bookings…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/80">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm">No {scope} bookings.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g.key}>
              <p className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wide mb-2">{g.label}</p>
              <div className="space-y-1.5">
                {g.sessions.map(s => {
                  const hours = s.bookings.length
                  const isOpen = expanded.has(s.id)
                  return (
                    <div key={s.id} className="bg-card border rounded-lg overflow-hidden">
                      {/* Summary row */}
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <button onClick={() => toggle(s.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/90 w-32 shrink-0">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground/80" />
                            {fmtTime(s.start)}–{fmtTime(s.end)}
                          </div>
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-300 bg-primary/10 rounded-full px-2 py-0.5 shrink-0">
                            {hours} hr{hours > 1 ? 's' : ''}
                          </span>
                          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <MapPin className="w-3 h-3 text-muted-foreground/80" />
                            {s.court_name}
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <PlayerAvatar name={s.display_name} color={s.avatar_color} imageUrl={s.avatar_url} size="xs" />
                            <span className="text-sm text-foreground truncate">{s.display_name}</span>
                            {s.status === 'pending' && (
                              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 rounded-full px-2 py-0.5 shrink-0">Awaiting approval</span>
                            )}
                          </div>
                          {hours > 1 && (isOpen
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground/80 shrink-0" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground/80 shrink-0" />)}
                        </button>
                        {scope === 'upcoming' && (
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 h-7 px-2 text-xs shrink-0"
                            onClick={() => onCancelClick(s)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>

                      {/* Expanded: compact hour chips */}
                      {isOpen && hours > 1 && (
                        <div className="border-t bg-muted/40 px-3 py-2.5">
                          <p className="text-[11px] text-muted-foreground/80 mb-2 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{s.court_name} · {hours} one-hour slots
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {s.bookings.map(b => (
                              scope === 'upcoming' ? (
                                <button
                                  key={b.id}
                                  onClick={() => onHourClick(s, b)}
                                  title="Cancel this hour"
                                  className="group text-[11px] font-medium text-muted-foreground bg-card border rounded-md px-2 py-1 hover:border-red-300 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                >
                                  {fmtHourChip(b.starts_at)}
                                  <span className="text-red-600 dark:text-red-400 ml-1 opacity-0 group-hover:opacity-100">✕</span>
                                </button>
                              ) : (
                                <span key={b.id} className="text-[11px] font-medium text-muted-foreground bg-card border rounded-md px-2 py-1">
                                  {fmtHourChip(b.starts_at)}
                                </span>
                              )
                            ))}
                          </div>
                          <p className="text-[11px] text-muted-foreground/80 mt-2">Tap an hour to cancel just that slot, or use Cancel above for the whole booking.</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cancel confirmation */}
      <Dialog open={!!confirmTarget} onOpenChange={v => { if (!v) setConfirmTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
          </DialogHeader>
          {confirmTarget && (
            <p className="text-sm text-muted-foreground">
              {confirmTarget.display_name}&apos;s booking on {confirmTarget.court_name} ({fmtTime(confirmTarget.start)}–{fmtTime(confirmTarget.end)})
              will be cancelled and the slot{confirmTarget.bookings.length > 1 ? 's' : ''} freed for others.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>Keep booking</Button>
            <Button variant="destructive" onClick={() => confirmTarget && cancelSession(confirmTarget)}>
              Yes, cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline booking request with a reason */}
      <Dialog open={!!rejectTarget} onOpenChange={v => { if (!v) { setRejectTarget(null); setRejectReason('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Decline this booking request?</DialogTitle></DialogHeader>
          {rejectTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {rejectTarget.display_name}&apos;s request for {rejectTarget.court_name} ({fmtTime(rejectTarget.start)}–{fmtTime(rejectTarget.end)}) will be declined.
              </p>
              <Textarea
                rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason (optional) — e.g. that court has an Open Play session at that time."
                className="text-sm resize-none"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason('') }}>Cancel</Button>
            <Button variant="destructive" onClick={doReject}>Decline request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Within 2 hours: contact admin instead of cancelling */}
      <Dialog open={!!contactTarget} onOpenChange={v => { if (!v) setContactTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancellation window closed</DialogTitle>
          </DialogHeader>
          {contactTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This booking starts in under 2 hours, so it can no longer be cancelled here.
                Please contact the court admin to cancel.
              </p>
              {contactTarget.contact_phone ? (
                <a
                  href={`tel:${contactTarget.contact_phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-300 underline"
                >
                  <Phone className="w-4 h-4" />
                  {contactTarget.contact_phone}
                </a>
              ) : (
                <p className="text-sm font-medium text-foreground/90">No contact number set — reach out to your league admin.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
