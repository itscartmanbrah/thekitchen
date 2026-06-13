'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { CalendarClock, MapPin, Clock } from 'lucide-react'

interface Row {
  id: string
  court_id: string
  user_id: string
  starts_at: string
  ends_at: string
  court_name: string
  is_indoor: boolean
  display_name: string
  avatar_color: string
  avatar_url: string | null
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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

export function LeagueBookings({ leagueId }: { leagueId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming')
  const { toast } = useToast()
  const supabase = createClient()

  async function fetchBookings() {
    setLoading(true)
    const nowIso = new Date().toISOString()
    let q = supabase
      .from('court_bookings')
      .select('id, court_id, user_id, starts_at, ends_at, courts(name, is_indoor)')
      .eq('league_id', leagueId)
      .eq('status', 'booked')

    q = scope === 'upcoming'
      ? q.gte('starts_at', nowIso).order('starts_at', { ascending: true })
      : q.lt('starts_at', nowIso).order('starts_at', { ascending: false }).limit(100)

    const { data } = await q
    const raw = (data ?? []) as any[]

    const userIds = Array.from(new Set(raw.map(r => r.user_id)))
    const { data: profs } = userIds.length
      ? await supabase.from('profiles').select('id, display_name, avatar_color, avatar_url').in('id', userIds)
      : { data: [] }
    const pMap = new Map(((profs ?? []) as any[]).map(p => [p.id, p]))

    setRows(raw.map(r => {
      const p = pMap.get(r.user_id)
      return {
        id: r.id, court_id: r.court_id, user_id: r.user_id,
        starts_at: r.starts_at, ends_at: r.ends_at,
        court_name: r.courts?.name ?? 'Court', is_indoor: r.courts?.is_indoor ?? false,
        display_name: p?.display_name ?? 'Unknown',
        avatar_color: p?.avatar_color ?? '#16a34a', avatar_url: p?.avatar_url ?? null,
      }
    }))
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [leagueId, scope])

  async function cancel(id: string) {
    const { error } = await supabase.rpc('cancel_court_booking', { p_booking_id: id })
    if (error) toast({ title: 'Could not cancel', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Booking cancelled' }); fetchBookings() }
  }

  // Group by day
  const groups: { key: string; label: string; rows: Row[] }[] = []
  for (const r of rows) {
    const key = dayKey(r.starts_at)
    let g = groups.find(x => x.key === key)
    if (!g) { g = { key, label: dayLabel(r.starts_at), rows: [] }; groups.push(g) }
    g.rows.push(r)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-green-600" />
          Court bookings
        </h2>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {(['upcoming', 'past'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                scope === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading bookings…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No {scope} bookings.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g.key}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{g.label}</p>
              <div className="space-y-1.5">
                {g.rows.map(r => (
                  <div key={r.id} className="flex items-center gap-3 bg-white border rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 w-32 shrink-0">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {fmtTime(r.starts_at)}–{fmtTime(r.ends_at)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 w-20 shrink-0">
                      <MapPin className="w-3 h-3 text-gray-400" />
                      {r.court_name}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <PlayerAvatar name={r.display_name} color={r.avatar_color} imageUrl={r.avatar_url} size="xs" />
                      <span className="text-sm text-gray-800 truncate">{r.display_name}</span>
                    </div>
                    {scope === 'upcoming' && (
                      <Button
                        size="sm" variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2 text-xs shrink-0"
                        onClick={() => cancel(r.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
