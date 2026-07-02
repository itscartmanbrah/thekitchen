'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { CalendarClock, MapPin, Clock, Phone } from 'lucide-react'

const CANCEL_WINDOW_MS = 2 * 60 * 60 * 1000

interface Row {
  id: string
  court_id: string
  league_id: string
  starts_at: string
  ends_at: string
  court_name: string
  league_name: string
  contact_phone: string | null
}

interface Session {
  id: string
  court_id: string
  league_id: string
  court_name: string
  league_name: string
  contact_phone: string | null
  start: string
  end: string
  bookings: Row[]
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtHourChip(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '')
}
function dayKey(iso: string) { const d = new Date(iso); d.setHours(0, 0, 0, 0); return d.toISOString() }
function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(dayKey(iso)).getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function buildSessions(rows: Row[]): Session[] {
  const sorted = [...rows].sort((a, b) =>
    a.court_id.localeCompare(b.court_id) ||
    new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  )
  const sessions: Session[] = []
  for (const r of sorted) {
    const last = sessions[sessions.length - 1]
    if (last && last.court_id === r.court_id &&
        new Date(last.end).getTime() === new Date(r.starts_at).getTime()) {
      last.end = r.ends_at
      last.bookings.push(r)
    } else {
      sessions.push({
        id: r.id, court_id: r.court_id, league_id: r.league_id,
        court_name: r.court_name, league_name: r.league_name, contact_phone: r.contact_phone,
        start: r.starts_at, end: r.ends_at, bookings: [r],
      })
    }
  }
  return sessions.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

export default function MyBookingsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming')
  const [confirmTarget, setConfirmTarget] = useState<Session | null>(null)
  const [contactTarget, setContactTarget] = useState<Session | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function fetchBookings() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const nowIso = new Date().toISOString()
    let q = supabase
      .from('court_bookings')
      .select('id, court_id, league_id, starts_at, ends_at, courts(name, contact_phone), leagues(name)')
      .eq('user_id', user.id)
      .eq('status', 'booked')

    q = scope === 'upcoming'
      ? q.gte('starts_at', nowIso).order('starts_at', { ascending: true })
      : q.lt('starts_at', nowIso).order('starts_at', { ascending: false }).limit(200)

    const { data } = await q
    setRows(((data ?? []) as any[]).map(r => ({
      id: r.id, court_id: r.court_id, league_id: r.league_id,
      starts_at: r.starts_at, ends_at: r.ends_at,
      court_name: r.courts?.name ?? 'Court',
      league_name: r.leagues?.name ?? 'League',
      contact_phone: r.courts?.contact_phone ?? null,
    })))
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [scope])

  function canCancel(s: Session) {
    return new Date(s.start).getTime() - Date.now() >= CANCEL_WINDOW_MS
  }
  function onCancelClick(s: Session) {
    if (canCancel(s)) setConfirmTarget(s)
    else setContactTarget(s)
  }
  function onHourClick(s: Session, b: Row) {
    const single: Session = { ...s, id: b.id, start: b.starts_at, end: b.ends_at, bookings: [b] }
    if (new Date(b.starts_at).getTime() - Date.now() >= CANCEL_WINDOW_MS) setConfirmTarget(single)
    else setContactTarget(single)
  }
  async function cancelSession(s: Session) {
    const { error } = await supabase.rpc('cancel_court_session', { p_booking_ids: s.bookings.map(b => b.id) })
    if (error) toast({ title: 'Could not cancel', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Booking cancelled' }); fetchBookings() }
    setConfirmTarget(null)
  }

  const sessions = buildSessions(rows)
  const groups: { key: string; label: string; sessions: Session[] }[] = []
  for (const s of sessions) {
    const key = dayKey(s.start)
    let g = groups.find(x => x.key === key)
    if (!g) { g = { key, label: dayLabel(s.start), sessions: [] }; groups.push(g) }
    g.sessions.push(s)
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-green-600" />
          My court bookings
        </h1>
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

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading bookings…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/80">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm">No {scope} court bookings.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g.key}>
              <p className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wide mb-2">{g.label}</p>
              <div className="space-y-1.5">
                {g.sessions.map(s => {
                  const hours = s.bookings.length
                  return (
                    <div key={s.id} className="bg-card border rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/90 w-32 shrink-0">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground/80" />
                          {fmtTime(s.start)}–{fmtTime(s.end)}
                        </div>
                        <span className="text-[11px] font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5 shrink-0">
                          {hours} hr{hours > 1 ? 's' : ''}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{s.court_name}</p>
                          <p className="text-xs text-muted-foreground/80 truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{s.league_name}
                          </p>
                        </div>
                        {scope === 'upcoming' && (
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2 text-xs shrink-0"
                            onClick={() => onCancelClick(s)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>

                      {scope === 'upcoming' && hours > 1 && (
                        <div className="mt-2 pt-2 border-t flex flex-wrap gap-1.5">
                          {s.bookings.map(b => (
                            <button
                              key={b.id}
                              onClick={() => onHourClick(s, b)}
                              title="Cancel this hour"
                              className="group text-[11px] font-medium text-muted-foreground bg-card border rounded-md px-2 py-1 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              {fmtHourChip(b.starts_at)}
                              <span className="text-red-400 ml-1 opacity-0 group-hover:opacity-100">✕</span>
                            </button>
                          ))}
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

      {/* Confirm cancel */}
      <Dialog open={!!confirmTarget} onOpenChange={v => { if (!v) setConfirmTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cancel this booking?</DialogTitle></DialogHeader>
          {confirmTarget && (
            <p className="text-sm text-muted-foreground">
              Your booking on {confirmTarget.court_name} ({fmtTime(confirmTarget.start)}–{fmtTime(confirmTarget.end)})
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

      {/* Contact admin (within 2 hours) */}
      <Dialog open={!!contactTarget} onOpenChange={v => { if (!v) setContactTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cancellation window closed</DialogTitle></DialogHeader>
          {contactTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This booking starts in under 2 hours, so it can no longer be cancelled here.
                Please contact the court admin to cancel.
              </p>
              {contactTarget.contact_phone ? (
                <a
                  href={`tel:${contactTarget.contact_phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 font-medium text-green-700 underline"
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
