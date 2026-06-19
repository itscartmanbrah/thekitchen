'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { MapPin, Plus, Trash2, Home, Sun, ChevronLeft, ChevronRight, Phone, Clock, Pencil, Navigation } from 'lucide-react'

const DEFAULT_POLICY = `Cancel at least 2 hours before your booking starts.
Within 2 hours of the start time, contact the court admin to cancel.
Please arrive on time — repeated no-shows may affect future bookings.`

interface Court {
  id: string
  name: string
  is_indoor: boolean
  open_hour: number
  close_hour: number
  contact_phone: string | null
}

interface Booking {
  id: string
  court_id: string
  user_id: string
  starts_at: string
  status: 'pending' | 'booked'
}
interface OpenPlayBlock {
  court_ids: string[]
  starts_at: string
  ends_at: string
}

interface Props {
  leagueId: string
  currentUserId: string
  isAdmin: boolean
}

interface Detail {
  court: Court
  userId: string
  mine: boolean
  bookings: Booking[]   // contiguous session, sorted
}

const CANCEL_WINDOW_MS = 2 * 60 * 60 * 1000

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function sameDay(a: Date, b: Date) { return startOfDay(a).getTime() === startOfDay(b).getTime() }
function fmtHourShort(h: number) {
  const period = h >= 12 ? 'pm' : 'am'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}${period}`
}
function fmtHourLong(h: number) {
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:00 ${period}`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function LeagueCourts({ leagueId, currentUserId, isAdmin }: Props) {
  const [courts, setCourts] = useState<Court[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [openPlay, setOpenPlay] = useState<OpenPlayBlock[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [calMonth, setCalMonth] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState<{ courtId: string; hour: number }[]>([])
  const [booking, setBooking] = useState(false)

  const [detail, setDetail] = useState<Detail | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  // Add-court dialog
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [isIndoor, setIsIndoor] = useState(false)
  const [openHour, setOpenHour] = useState(6)
  const [closeHour, setCloseHour] = useState(22)
  const [contactPhone, setContactPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Court | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // League court info (policy + address)
  const [policy, setPolicy] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [leagueLocation, setLeagueLocation] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [policyDraft, setPolicyDraft] = useState('')
  const [addressDraft, setAddressDraft] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)

  const { toast } = useToast()
  const supabase = createClient()
  const today = startOfDay(new Date())

  async function fetchCourts() {
    const { data } = await supabase
      .from('courts').select('*').eq('league_id', leagueId).eq('active', true).order('created_at')
    setCourts((data as Court[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { fetchCourts() }, [leagueId])
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? '')) }, [])

  async function fetchLeagueInfo() {
    const { data } = await supabase
      .from('leagues').select('cancellation_policy, court_address, location').eq('id', leagueId).single()
    setPolicy((data as any)?.cancellation_policy ?? null)
    setAddress((data as any)?.court_address ?? null)
    setLeagueLocation((data as any)?.location ?? null)
  }
  useEffect(() => { fetchLeagueInfo() }, [leagueId])

  async function saveInfo() {
    setSavingInfo(true)
    const { error } = await supabase
      .from('leagues')
      .update({ cancellation_policy: policyDraft.trim() || null, court_address: addressDraft.trim() || null } as any)
      .eq('id', leagueId)
    if (error) toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Court info updated' }); setInfoOpen(false); fetchLeagueInfo() }
    setSavingInfo(false)
  }

  async function fetchBookings() {
    const dayStart = startOfDay(selectedDate)
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
    const { data } = await supabase
      .from('court_bookings')
      .select('id, court_id, user_id, starts_at, status')
      .eq('league_id', leagueId)
      .in('status', ['pending', 'booked'])
      .gte('starts_at', dayStart.toISOString())
      .lt('starts_at', dayEnd.toISOString())
    const list = (data as Booking[]) ?? []
    setBookings(list)

    // Open Play sessions occupying courts that day (not finished)
    const { data: op } = await supabase
      .from('play_sessions')
      .select('court_ids, starts_at, ends_at')
      .eq('league_id', leagueId)
      .is('ended_at', null)
      .not('court_ids', 'is', null)
      .lt('starts_at', dayEnd.toISOString())
      .gt('ends_at', dayStart.toISOString())
    setOpenPlay(((op ?? []) as OpenPlayBlock[]))
    // Only admins see who booked each slot; players/officiators see generic "Booked".
    if (!isAdmin) return
    const ids = Array.from(new Set(list.map(b => b.user_id))).filter(id => !(id in names))
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name, first_name, last_name').in('id', ids)
      const next = { ...names }
      for (const p of (profs ?? []) as any[]) {
        const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
        next[p.id] = full || p.display_name
      }
      setNames(next)
    }
  }
  useEffect(() => { setSelected([]); if (courts.length) fetchBookings() }, [selectedDate, courts.length, leagueId])

  async function confirmBooking() {
    if (!selected.length) return
    setBooking(true)
    // Group selected slots by court so each court books in one call (one notification)
    const byCourt = new Map<string, string[]>()
    for (const sel of selected) {
      const slot = new Date(startOfDay(selectedDate)); slot.setHours(sel.hour, 0, 0, 0)
      const arr = byCourt.get(sel.courtId) ?? []
      arr.push(slot.toISOString())
      byCourt.set(sel.courtId, arr)
    }
    let firstError = ''
    for (const [courtId, starts] of Array.from(byCourt.entries())) {
      const { error } = await supabase.rpc('book_court_session', { p_court_id: courtId, p_starts_at: starts })
      if (error) firstError = error.message
    }
    if (!firstError) toast({ title: `Requested ${selected.length} slot${selected.length > 1 ? 's' : ''}!`, description: 'An admin will review and approve your booking.' })
    else toast({ title: 'Some slots could not be requested', description: firstError, variant: 'destructive' })
    setSelected([])
    await fetchBookings()
    setBooking(false)
  }

  async function cancelSession() {
    if (!detail) return
    setCancelling(true)
    const { error } = await supabase.rpc('cancel_court_session', {
      p_booking_ids: detail.bookings.map(b => b.id),
    })
    if (error) toast({ title: 'Could not cancel', description: error.message, variant: 'destructive' })
    else toast({ title: 'Booking cancelled' })
    setDetail(null)
    setConfirmCancel(false)
    await fetchBookings()
    setCancelling(false)
  }

  async function addCourt() {
    if (!name.trim()) { toast({ title: 'Name the court', variant: 'destructive' }); return }
    if (closeHour <= openHour) { toast({ title: 'Closing hour must be after opening hour', variant: 'destructive' }); return }
    setSaving(true)
    const { error } = await supabase.from('courts').insert({
      league_id: leagueId, name: name.trim(), is_indoor: isIndoor,
      open_hour: openHour, close_hour: closeHour, contact_phone: contactPhone.trim() || null,
    } as any)
    if (error) toast({ title: 'Could not add court', description: error.message, variant: 'destructive' })
    else {
      toast({ title: 'Court added' })
      setAddOpen(false); setName(''); setIsIndoor(false); setOpenHour(6); setCloseHour(22); setContactPhone('')
      fetchCourts()
    }
    setSaving(false)
  }

  function openDelete(court: Court) {
    setDeleteTarget(court); setDeletePassword(''); setDeleteError('')
  }

  async function deleteCourt() {
    if (!deleteTarget) return
    if (!deletePassword) { setDeleteError('Enter your password to confirm.'); return }
    setDeleting(true)
    setDeleteError('')
    // Re-authenticate to confirm it's really the admin
    const { error: authError } = await supabase.auth.signInWithPassword({ email: userEmail, password: deletePassword })
    if (authError) {
      setDeleteError('Incorrect password.')
      setDeleting(false)
      return
    }
    const { error } = await supabase.from('courts').delete().eq('id', deleteTarget.id)
    if (error) setDeleteError(error.message)
    else { toast({ title: `"${deleteTarget.name}" removed` }); setDeleteTarget(null); fetchCourts() }
    setDeleting(false)
  }

  const AddCourtDialog = (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add a court</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="court-name">Court name</Label>
            <Input id="court-name" placeholder="e.g. Court 1" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsIndoor(false)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm ${!isIndoor ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600'}`}>
              <Sun className="w-4 h-4" />Outdoor
            </button>
            <button onClick={() => setIsIndoor(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm ${isIndoor ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600'}`}>
              <Home className="w-4 h-4" />Indoor
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="open-hour">Opens</Label>
              <select id="open-hour" value={openHour} onChange={e => setOpenHour(parseInt(e.target.value))}
                className="w-full h-10 text-sm border border-input rounded-md px-2 bg-white">
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHourLong(h)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close-hour">Closes</Label>
              <select id="close-hour" value={closeHour} onChange={e => setCloseHour(parseInt(e.target.value))}
                className="w-full h-10 text-sm border border-input rounded-md px-2 bg-white">
                {Array.from({ length: 24 }, (_, h) => h + 1).map(h => <option key={h} value={h}>{fmtHourLong(h % 24)}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">
              Contact phone <span className="text-gray-400 font-normal">(for cancellations)</span>
            </Label>
            <Input
              id="contact-phone" type="tel" inputMode="tel" placeholder="+63 900 000 0000"
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value.replace(/[^\d\s+\-().]/g, ''))}
              maxLength={20}
            />
            <p className="text-xs text-gray-400">Shown to players who need to cancel within 2 hours of their booking.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={addCourt} disabled={saving}>{saving ? 'Adding…' : 'Add court'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (loading) return <div className="text-center py-12 text-gray-500">Loading courts…</div>

  if (courts.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm mb-4">No courts set up yet.{isAdmin ? '' : ' Ask an admin to add one.'}</p>
        {isAdmin && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add a court</Button>}
        {AddCourtDialog}
      </div>
    )
  }

  const minOpen = Math.min(...courts.map(c => c.open_hour))
  const maxClose = Math.max(...courts.map(c => c.close_hour))
  const hours = Array.from({ length: maxClose - minOpen }, (_, i) => minOpen + i)
  const now = Date.now()

  const bookingAt = (courtId: string, hour: number) =>
    bookings.find(b => b.court_id === courtId && new Date(b.starts_at).getHours() === hour)
  const isSelected = (courtId: string, hour: number) =>
    selected.some(s => s.courtId === courtId && s.hour === hour)
  // Is this court+hour inside an Open Play window?
  const openPlayAt = (courtId: string, hour: number) => {
    const slotStart = new Date(startOfDay(selectedDate)); slotStart.setHours(hour, 0, 0, 0)
    const slotEnd = new Date(slotStart); slotEnd.setHours(hour + 1)
    return openPlay.some(op =>
      op.court_ids?.includes(courtId) &&
      new Date(op.starts_at).getTime() < slotEnd.getTime() &&
      new Date(op.ends_at).getTime() > slotStart.getTime()
    )
  }

  function onCellClick(court: Court, hour: number) {
    if (hour < court.open_hour || hour >= court.close_hour) return
    if (openPlayAt(court.id, hour)) return
    const slot = new Date(startOfDay(selectedDate)); slot.setHours(hour, 0, 0, 0)
    if (slot.getTime() < now) return
    const bk = bookingAt(court.id, hour)
    if (bk) {
      // Cancel just the clicked hour, not the whole booking block
      if (bk.user_id === currentUserId || isAdmin) {
        setDetail({
          court, userId: bk.user_id, mine: bk.user_id === currentUserId,
          bookings: [bk],
        })
      }
      return
    }
    setSelected(prev => isSelected(court.id, hour)
      ? prev.filter(s => !(s.courtId === court.id && s.hour === hour))
      : [...prev, { courtId: court.id, hour }])
  }

  // Month calendar
  const firstOfMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate()
  const calCells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) calCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) calCells.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), d))

  // Detail dialog derived values
  const detailStart = detail?.bookings[0]?.starts_at
  const detailEndHour = detail ? new Date(detail.bookings[detail.bookings.length - 1].starts_at).getHours() + 1 : 0
  const detailHours = detail?.bookings.length ?? 0
  const canCancel = detail
    ? (isAdmin || (detailStart != null && new Date(detailStart).getTime() - Date.now() >= CANCEL_WINDOW_MS))
    : false

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{courts.length} court{courts.length !== 1 ? 's' : ''} · each slot 60 min</p>
        {isAdmin && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add court</Button>}
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Calendar */}
        <div className="lg:w-72 shrink-0">
          <div className="border rounded-xl p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                className="w-7 h-7 rounded-full border flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900">
                {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                className="w-7 h-7 rounded-full border flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="text-[11px] font-medium text-gray-400">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calCells.map((d, i) => {
                if (!d) return <span key={i} />
                const past = startOfDay(d).getTime() < today.getTime()
                const isSel = sameDay(d, selectedDate)
                return (
                  <button
                    key={i}
                    disabled={past}
                    onClick={() => setSelectedDate(startOfDay(d))}
                    className={`h-8 rounded-full text-xs flex items-center justify-center transition-colors ${
                      isSel ? 'bg-gray-900 text-white font-semibold'
                        : past ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-700 hover:bg-green-50'
                    }`}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Timetable */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-gray-900">
              Select slots for {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </h3>
            <div className="flex items-center gap-2.5 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />Booked</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" />Pending</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />Open Play</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-900 inline-block" />Selected</span>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-xl">
            <table className="border-collapse w-full">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-900 text-white text-xs font-medium px-3 py-2 text-left min-w-[90px]">Court</th>
                  {hours.map(h => (
                    <th key={h} className="bg-gray-900 text-white text-[11px] font-medium px-2 py-2 min-w-[52px] border-l border-gray-700">
                      {fmtHourShort(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courts.map(court => (
                  <tr key={court.id} className="border-t">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-medium text-gray-800 whitespace-nowrap border-r">
                      <span className="flex items-center gap-1.5">
                        {court.is_indoor ? <Home className="w-3.5 h-3.5 text-gray-400" /> : <Sun className="w-3.5 h-3.5 text-gray-400" />}
                        {court.name}
                      </span>
                    </td>
                    {hours.map(h => {
                      const outOfHours = h < court.open_hour || h >= court.close_hour
                      const slot = new Date(startOfDay(selectedDate)); slot.setHours(h, 0, 0, 0)
                      const isPast = slot.getTime() < now
                      const isOpenPlay = openPlayAt(court.id, h)
                      const bk = bookingAt(court.id, h)
                      const sel = isSelected(court.id, h)
                      const mine = bk?.user_id === currentUserId
                      const pending = bk?.status === 'pending'

                      let cls = 'bg-white hover:bg-green-50 cursor-pointer'
                      let label = ''
                      let textCls = 'text-transparent'
                      if (outOfHours || isPast) { cls = 'bg-gray-200 cursor-not-allowed' }
                      if (isOpenPlay) {
                        cls = 'bg-blue-500 cursor-not-allowed'
                        label = 'Open Play'; textCls = 'text-white'
                      } else if (bk) {
                        cls = pending
                          ? `bg-amber-400 ${(mine || isAdmin) ? 'cursor-pointer hover:bg-amber-500' : 'cursor-default'}`
                          : `bg-green-500 ${(mine || isAdmin) ? 'cursor-pointer hover:bg-green-600' : 'cursor-default'}`
                        label = mine ? (pending ? 'Pending' : 'You') : isAdmin ? (names[bk.user_id]?.split(' ')[0] ?? '•') : ''
                        textCls = 'text-white'
                      } else if (sel) {
                        cls = 'bg-gray-900 cursor-pointer'; textCls = 'text-white'
                      }

                      return (
                        <td
                          key={h}
                          onClick={() => onCellClick(court, h)}
                          title={isOpenPlay ? 'Open Play session' : bk ? (mine ? (pending ? 'Awaiting admin approval — tap to withdraw' : 'Your booking — tap for details') : isAdmin ? `${pending ? 'Requested' : 'Booked'} by ${names[bk.user_id] ?? '…'} — tap to manage` : pending ? 'Requested' : 'Booked') : outOfHours ? 'Closed' : isPast ? 'Past' : 'Tap to select'}
                          className={`border-l h-10 text-center align-middle text-[9px] font-medium select-none ${cls} ${textCls}`}
                        >
                          {label}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-2">
            Tap open cells to select, then confirm. Tap your booking to manage it.
          </p>

          {selected.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              <span className="text-sm text-green-800 font-medium">
                {selected.length} slot{selected.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected([])}>Clear</Button>
                <Button size="sm" onClick={confirmBooking} disabled={booking}>
                  {booking ? 'Booking…' : 'Confirm booking'}
                </Button>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="mt-4 flex flex-wrap gap-2">
              {courts.map(c => (
                <button key={c.id} onClick={() => openDelete(c)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 border rounded-full px-2.5 py-1">
                  <Trash2 className="w-3 h-3" />{c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cancellation policy + address */}
      {(() => {
        const shownAddress = address || leagueLocation
        return (
          <div className="mt-8 border-t pt-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-bold text-gray-900">Cancellation policy</h3>
                {isAdmin && (
                  <button
                    onClick={() => { setPolicyDraft(policy ?? DEFAULT_POLICY); setAddressDraft(address ?? ''); setInfoOpen(true) }}
                    className="text-gray-400 hover:text-green-600"
                    title="Edit policy & address"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-600">
                {(policy ?? DEFAULT_POLICY).split('\n').filter(l => l.trim()).map((line, i) => (
                  <li key={i}>{line.trim()}</li>
                ))}
              </ol>
            </div>

            {shownAddress && (
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Getting there</h3>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <p className="text-sm text-gray-600 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    {shownAddress}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shownAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm border rounded-full px-3 py-1.5 text-gray-700 hover:border-green-400 hover:text-green-700"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Get directions
                  </a>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {AddCourtDialog}

      {/* Edit policy + address dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Court info</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="policy">Cancellation policy</Label>
              <Textarea
                id="policy" rows={5} value={policyDraft}
                onChange={e => setPolicyDraft(e.target.value)}
                placeholder={DEFAULT_POLICY}
                className="text-sm"
              />
              <p className="text-xs text-gray-400">One rule per line — shown as a numbered list.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Court address</Label>
              <Input
                id="address" value={addressDraft}
                onChange={e => setAddressDraft(e.target.value)}
                placeholder="e.g. Oakhill Park, Catadman National Highway, Ozamiz City 7200"
              />
              <p className="text-xs text-gray-400">Used for the &ldquo;Get directions&rdquo; link.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoOpen(false)}>Cancel</Button>
            <Button onClick={saveInfo} disabled={savingInfo}>{savingInfo ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking detail / cancel dialog */}
      <Dialog open={!!detail} onOpenChange={v => { if (!v) { setDetail(null); setConfirmCancel(false) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.court.is_indoor ? <Home className="w-4 h-4 text-gray-400" /> : <Sun className="w-4 h-4 text-gray-400" />}
              {detail?.court.name}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-800">
                <Clock className="w-4 h-4 text-gray-400" />
                {fmtTime(detail.bookings[0].starts_at)} – {fmtHourLong(detailEndHour % 24)}
                <span className="text-xs text-green-700 bg-green-50 rounded-full px-2 py-0.5 ml-1">
                  {detailHours} hr{detailHours > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                {!detail.mine && ` · booked by ${names[detail.userId] ?? 'a member'}`}
              </p>

              {canCancel ? (
                confirmCancel ? (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
                    Are you sure you want to cancel this booking? The slot{detailHours > 1 ? 's' : ''} will be freed for others.
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    {isAdmin && !detail.mine
                      ? 'As an admin you can cancel this booking.'
                      : 'You can cancel up to 2 hours before the start time.'}
                  </p>
                )
              ) : (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 space-y-2">
                  <p>Cancellations close 2 hours before the start time. To cancel now, please contact the court admin.</p>
                  {detail.court.contact_phone ? (
                    <a
                      href={`tel:${detail.court.contact_phone.replace(/[^\d+]/g, '')}`}
                      className="inline-flex items-center gap-1.5 font-medium text-amber-900 underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {detail.court.contact_phone}
                    </a>
                  ) : (
                    <p className="font-medium">No contact number set — reach out to your league admin.</p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {confirmCancel ? (
              <>
                <Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep booking</Button>
                <Button variant="destructive" onClick={cancelSession} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Yes, cancel booking'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
                {canCancel && (
                  <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
                    Cancel booking
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" />Delete &ldquo;{deleteTarget?.name}&rdquo;?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">This removes the court and all its bookings. This can&apos;t be undone.</p>
            <div className="space-y-1.5">
              <Label htmlFor="delete-password">Enter your password to confirm</Label>
              <Input
                id="delete-password"
                type="password"
                placeholder="Your account password"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                onKeyDown={e => { if (e.key === 'Enter') deleteCourt() }}
              />
              {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteCourt} disabled={deleting || !deletePassword}>
              {deleting ? 'Deleting…' : 'Delete court'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
