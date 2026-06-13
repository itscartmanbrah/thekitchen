'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { MapPin, Plus, Trash2, Home, Sun, ChevronLeft, ChevronRight } from 'lucide-react'

interface Court {
  id: string
  name: string
  is_indoor: boolean
  open_hour: number
  close_hour: number
}

interface Booking {
  id: string
  court_id: string
  user_id: string
  starts_at: string
}

interface Props {
  leagueId: string
  currentUserId: string
  isAdmin: boolean
}

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

export function LeagueCourts({ leagueId, currentUserId, isAdmin }: Props) {
  const [courts, setCourts] = useState<Court[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [calMonth, setCalMonth] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState<{ courtId: string; hour: number }[]>([])
  const [booking, setBooking] = useState(false)

  // Add-court dialog
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [isIndoor, setIsIndoor] = useState(false)
  const [openHour, setOpenHour] = useState(6)
  const [closeHour, setCloseHour] = useState(22)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Court | null>(null)

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

  async function fetchBookings() {
    const dayStart = startOfDay(selectedDate)
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
    const { data } = await supabase
      .from('court_bookings')
      .select('id, court_id, user_id, starts_at')
      .eq('league_id', leagueId)
      .eq('status', 'booked')
      .gte('starts_at', dayStart.toISOString())
      .lt('starts_at', dayEnd.toISOString())
    const list = (data as Booking[]) ?? []
    setBookings(list)
    const ids = Array.from(new Set(list.map(b => b.user_id))).filter(id => !(id in names))
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', ids)
      const next = { ...names }
      for (const p of (profs ?? []) as any[]) next[p.id] = p.display_name
      setNames(next)
    }
  }
  useEffect(() => { setSelected([]); if (courts.length) fetchBookings() }, [selectedDate, courts.length, leagueId])

  async function confirmBooking() {
    if (!selected.length) return
    setBooking(true)
    let ok = 0
    let firstError = ''
    for (const sel of selected) {
      const slot = new Date(startOfDay(selectedDate)); slot.setHours(sel.hour, 0, 0, 0)
      const { error } = await supabase.rpc('book_court', { p_court_id: sel.courtId, p_starts_at: slot.toISOString() })
      if (error) firstError = error.message
      else ok++
    }
    if (ok > 0) toast({ title: `Booked ${ok} slot${ok > 1 ? 's' : ''}! 🎾` })
    if (firstError) toast({ title: 'Some slots could not be booked', description: firstError, variant: 'destructive' })
    setSelected([])
    await fetchBookings()
    setBooking(false)
  }

  async function cancelBooking(id: string) {
    const { error } = await supabase.rpc('cancel_court_booking', { p_booking_id: id })
    if (error) toast({ title: 'Could not cancel', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Booking cancelled' }); fetchBookings() }
  }

  async function addCourt() {
    if (!name.trim()) { toast({ title: 'Name the court', variant: 'destructive' }); return }
    if (closeHour <= openHour) { toast({ title: 'Closing hour must be after opening hour', variant: 'destructive' }); return }
    setSaving(true)
    const { error } = await supabase.from('courts').insert({
      league_id: leagueId, name: name.trim(), is_indoor: isIndoor, open_hour: openHour, close_hour: closeHour,
    } as any)
    if (error) toast({ title: 'Could not add court', description: error.message, variant: 'destructive' })
    else {
      toast({ title: 'Court added' })
      setAddOpen(false); setName(''); setIsIndoor(false); setOpenHour(6); setCloseHour(22)
      fetchCourts()
    }
    setSaving(false)
  }

  async function deleteCourt() {
    if (!deleteTarget) return
    const { error } = await supabase.from('courts').delete().eq('id', deleteTarget.id)
    if (error) toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
    else { toast({ title: `"${deleteTarget.name}" removed` }); setDeleteTarget(null); fetchCourts() }
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

  // Grid hour range across all courts
  const minOpen = Math.min(...courts.map(c => c.open_hour))
  const maxClose = Math.max(...courts.map(c => c.close_hour))
  const hours = Array.from({ length: maxClose - minOpen }, (_, i) => minOpen + i)
  const now = Date.now()

  const bookingAt = (courtId: string, hour: number) =>
    bookings.find(b => b.court_id === courtId && new Date(b.starts_at).getHours() === hour)
  const isSelected = (courtId: string, hour: number) =>
    selected.some(s => s.courtId === courtId && s.hour === hour)

  function toggleCell(court: Court, hour: number) {
    if (hour < court.open_hour || hour >= court.close_hour) return
    const slot = new Date(startOfDay(selectedDate)); slot.setHours(hour, 0, 0, 0)
    if (slot.getTime() < now) return
    const existing = bookingAt(court.id, hour)
    if (existing) {
      if (existing.user_id === currentUserId || isAdmin) cancelBooking(existing.id)
      return
    }
    setSelected(prev => isSelected(court.id, hour)
      ? prev.filter(s => !(s.courtId === court.id && s.hour === hour))
      : [...prev, { courtId: court.id, hour }])
  }

  // Month calendar grid
  const firstOfMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate()
  const calCells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) calCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) calCells.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), d))

  return (
    <div>
      {/* Header */}
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
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />Booked</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-900 inline-block" />Selected</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" />Unavailable</span>
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
                      const bk = bookingAt(court.id, h)
                      const sel = isSelected(court.id, h)
                      const mine = bk?.user_id === currentUserId

                      let cls = 'bg-white hover:bg-green-50 cursor-pointer'
                      let label = ''
                      if (outOfHours || isPast) { cls = 'bg-gray-200 cursor-not-allowed'; }
                      if (bk) {
                        cls = `bg-green-500 ${(mine || isAdmin) ? 'cursor-pointer hover:bg-green-600' : 'cursor-default'}`
                        label = mine ? 'You' : (names[bk.user_id]?.split(' ')[0] ?? '•')
                      } else if (sel) {
                        cls = 'bg-gray-900 cursor-pointer'
                      }

                      return (
                        <td
                          key={h}
                          onClick={() => toggleCell(court, h)}
                          title={bk ? (mine ? 'Your booking — tap to cancel' : `Booked by ${names[bk.user_id] ?? '…'}${isAdmin ? ' — tap to cancel' : ''}`) : outOfHours ? 'Closed' : isPast ? 'Past' : 'Tap to select'}
                          className={`border-l h-10 text-center align-middle text-[10px] font-medium select-none ${cls} ${bk ? 'text-white' : sel ? 'text-white' : 'text-transparent'}`}
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
            Tap an open cell to select it, then confirm. Tap a green cell you booked to cancel.
          </p>

          {/* Confirm bar */}
          {selected.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              <span className="text-sm text-green-800 font-medium">
                {selected.length} slot{selected.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected([])}>Clear</Button>
                <Button size="sm" onClick={confirmBooking} disabled={booking}>
                  {booking ? 'Booking…' : `Confirm booking`}
                </Button>
              </div>
            </div>
          )}

          {/* Admin: delete a court */}
          {isAdmin && (
            <div className="mt-4 flex flex-wrap gap-2">
              {courts.map(c => (
                <button key={c.id} onClick={() => setDeleteTarget(c)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 border rounded-full px-2.5 py-1">
                  <Trash2 className="w-3 h-3" />{c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {AddCourtDialog}

      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" />Delete &ldquo;{deleteTarget?.name}&rdquo;?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">This removes the court and all its bookings. This can&apos;t be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteCourt}>Delete court</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
