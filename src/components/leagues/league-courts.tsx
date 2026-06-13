'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { MapPin, Plus, Trash2, Home, Sun, Clock, Check } from 'lucide-react'

interface Court {
  id: string
  name: string
  is_indoor: boolean
  open_hour: number
  close_hour: number
  active: boolean
}

interface Booking {
  id: string
  court_id: string
  user_id: string
  starts_at: string
  ends_at: string
}

interface Props {
  leagueId: string
  currentUserId: string
  isAdmin: boolean
}

const DAYS_AHEAD = 7

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function fmtHour(h: number) {
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:00 ${period}`
}
function dayLabel(d: Date, today: Date) {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

export function LeagueCourts({ leagueId, currentUserId, isAdmin }: Props) {
  const [courts, setCourts] = useState<Court[]>([])
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busySlot, setBusySlot] = useState<number | null>(null)

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
      .from('courts')
      .select('*')
      .eq('league_id', leagueId)
      .eq('active', true)
      .order('created_at')
    const list = (data as Court[]) ?? []
    setCourts(list)
    setSelectedCourtId(prev => prev || list[0]?.id || '')
    setLoading(false)
  }

  useEffect(() => { fetchCourts() }, [leagueId])

  async function fetchBookings() {
    if (!selectedCourtId) { setBookings([]); return }
    const dayStart = startOfDay(selectedDate)
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
    const { data } = await supabase
      .from('court_bookings')
      .select('id, court_id, user_id, starts_at, ends_at')
      .eq('court_id', selectedCourtId)
      .eq('status', 'booked')
      .gte('starts_at', dayStart.toISOString())
      .lt('starts_at', dayEnd.toISOString())
    const list = (data as Booking[]) ?? []
    setBookings(list)

    const ids = Array.from(new Set(list.map(b => b.user_id)))
    const missing = ids.filter(id => !(id in names))
    if (missing.length) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', missing)
      const next = { ...names }
      for (const p of (profs ?? []) as any[]) next[p.id] = p.display_name
      setNames(next)
    }
  }

  useEffect(() => { fetchBookings() }, [selectedCourtId, selectedDate])

  async function book(slotStart: Date, hour: number) {
    setBusySlot(hour)
    const { error } = await supabase.rpc('book_court', {
      p_court_id: selectedCourtId,
      p_starts_at: slotStart.toISOString(),
    })
    if (error) toast({ title: 'Could not book', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Court booked! 🎾' }); await fetchBookings() }
    setBusySlot(null)
  }

  async function cancel(bookingId: string) {
    const { error } = await supabase.rpc('cancel_court_booking', { p_booking_id: bookingId })
    if (error) toast({ title: 'Could not cancel', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Booking cancelled' }); fetchBookings() }
  }

  async function addCourt() {
    if (!name.trim()) { toast({ title: 'Name the court', variant: 'destructive' }); return }
    if (closeHour <= openHour) { toast({ title: 'Closing hour must be after opening hour', variant: 'destructive' }); return }
    setSaving(true)
    const { error } = await supabase.from('courts').insert({
      league_id: leagueId, name: name.trim(), is_indoor: isIndoor,
      open_hour: openHour, close_hour: closeHour,
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
    else {
      toast({ title: `"${deleteTarget.name}" removed` })
      if (selectedCourtId === deleteTarget.id) setSelectedCourtId('')
      setDeleteTarget(null)
      fetchCourts()
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading courts…</div>

  if (courts.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm mb-4">No courts set up yet.{isAdmin ? '' : ' Ask an admin to add one.'}</p>
        {isAdmin && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add a court</Button>}
        <AddCourtDialog />
      </div>
    )
  }

  const selectedCourt = courts.find(c => c.id === selectedCourtId) ?? courts[0]
  const now = Date.now()
  const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d })

  const bookingByHour = new Map<number, Booking>()
  for (const b of bookings) bookingByHour.set(new Date(b.starts_at).getHours(), b)

  function AddCourtDialog() {
    return (
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add a court</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="court-name">Court name</Label>
              <Input id="court-name" placeholder="e.g. Court 1" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsIndoor(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm ${!isIndoor ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600'}`}
              ><Sun className="w-4 h-4" />Outdoor</button>
              <button
                onClick={() => setIsIndoor(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm ${isIndoor ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600'}`}
              ><Home className="w-4 h-4" />Indoor</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="open-hour">Opens</Label>
                <select id="open-hour" value={openHour} onChange={e => setOpenHour(parseInt(e.target.value))}
                  className="w-full h-10 text-sm border border-input rounded-md px-2 bg-white">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="close-hour">Closes</Label>
                <select id="close-hour" value={closeHour} onChange={e => setCloseHour(parseInt(e.target.value))}
                  className="w-full h-10 text-sm border border-input rounded-md px-2 bg-white">
                  {Array.from({ length: 24 }, (_, h) => h + 1).map(h => <option key={h} value={h}>{fmtHour(h % 24)}</option>)}
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
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{courts.length} court{courts.length !== 1 ? 's' : ''}</p>
        {isAdmin && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add court</Button>}
      </div>

      {/* Date strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {dates.map(d => {
          const active = startOfDay(d).getTime() === startOfDay(selectedDate).getTime()
          return (
            <button
              key={d.toISOString()}
              onClick={() => setSelectedDate(startOfDay(d))}
              className={`shrink-0 px-3 py-2 rounded-lg border text-center transition-colors ${active ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className={`text-xs font-medium ${active ? 'text-green-700' : 'text-gray-500'}`}>{dayLabel(d, today)}</div>
              <div className={`text-sm font-bold ${active ? 'text-green-700' : 'text-gray-800'}`}>{d.getDate()}</div>
            </button>
          )
        })}
      </div>

      {/* Court chips */}
      {courts.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          {courts.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCourtId(c.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${c.id === selectedCourt.id ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              {c.is_indoor ? <Home className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Court header + admin delete */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
          {selectedCourt.is_indoor ? <Home className="w-4 h-4 text-gray-400" /> : <Sun className="w-4 h-4 text-gray-400" />}
          {selectedCourt.name}
          <span className="text-xs font-normal text-gray-400">· {fmtHour(selectedCourt.open_hour)}–{fmtHour(selectedCourt.close_hour % 24)}</span>
        </div>
        {isAdmin && (
          <button onClick={() => setDeleteTarget(selectedCourt)} className="text-gray-300 hover:text-red-500 p-1" title="Delete court">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Hourly slots */}
      <div className="space-y-1.5">
        {Array.from({ length: selectedCourt.close_hour - selectedCourt.open_hour }, (_, i) => selectedCourt.open_hour + i).map(hour => {
          const slotStart = new Date(startOfDay(selectedDate)); slotStart.setHours(hour, 0, 0, 0)
          const isPast = slotStart.getTime() < now
          const booking = bookingByHour.get(hour)
          const mine = booking?.user_id === currentUserId
          const canCancel = booking && (mine || isAdmin)

          return (
            <div
              key={hour}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                booking ? (mine ? 'border-green-200 bg-green-50/50' : 'border-gray-100 bg-gray-50') : isPast ? 'border-gray-100 opacity-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm text-gray-700 w-36 shrink-0">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                {fmtHour(hour)}
              </div>

              <div className="flex-1 min-w-0">
                {booking ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 truncate">
                      {mine ? 'Your booking' : `Booked · ${names[booking.user_id] ?? '…'}`}
                    </span>
                  </div>
                ) : isPast ? (
                  <span className="text-xs text-gray-400">Past</span>
                ) : (
                  <span className="text-xs text-gray-400">Available</span>
                )}
              </div>

              {canCancel ? (
                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2 text-xs" onClick={() => cancel(booking!.id)}>
                  Cancel
                </Button>
              ) : !booking && !isPast ? (
                <Button size="sm" className="h-7 px-3 text-xs" disabled={busySlot === hour} onClick={() => book(slotStart, hour)}>
                  {busySlot === hour ? '…' : 'Book'}
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>

      <AddCourtDialog />

      {/* Delete court confirm */}
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
