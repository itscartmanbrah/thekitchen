'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/player-avatar'
import { useToast } from '@/hooks/use-toast'
import { Swords, Clock, CheckCircle, XCircle, Ban } from 'lucide-react'

interface Challenge {
  id: string
  status: string
  format: string
  proposed_at: string | null
  message: string | null
  created_at: string
  challenger: { id: string; display_name: string; avatar_color: string; avatar_url: string | null }
  challenged: { id: string; display_name: string; avatar_color: string; avatar_url: string | null }
  officiator: { id: string; display_name: string; avatar_color: string; avatar_url: string | null }
}

const FORMAT_LABELS: Record<string, string> = {
  singles: 'Singles', doubles: 'Doubles', mixed_doubles: 'Mixed Doubles', round_robin: 'Round Robin',
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_officiator: { label: 'Awaiting officiator',  color: 'bg-orange-100 text-orange-700' },
  pending_player:     { label: 'Awaiting opponent',    color: 'bg-blue-100 text-blue-700' },
  accepted:           { label: 'Accepted',             color: 'bg-green-100 text-green-700' },
  declined_officiator:{ label: 'Officiator declined',  color: 'bg-red-100 text-red-600' },
  declined_player:    { label: 'Opponent declined',    color: 'bg-red-100 text-red-600' },
  cancelled:          { label: 'Cancelled',            color: 'bg-gray-100 text-gray-500' },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function LeagueChallenges({ leagueId, currentUserId }: { leagueId: string; currentUserId: string }) {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'action' | 'sent' | 'received' | 'all'>('action')
  const { toast } = useToast()
  const supabase = createClient()

  async function fetchChallenges() {
    const { data, error } = await supabase
      .from('challenges')
      .select(`
        id, status, format, proposed_at, message, created_at,
        challenger:profiles!challenger_id(id, display_name, avatar_color, avatar_url),
        challenged:profiles!challenged_id(id, display_name, avatar_color, avatar_url),
        officiator:profiles!officiator_id(id, display_name, avatar_color, avatar_url)
      `)
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (!error) setChallenges((data as unknown as Challenge[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchChallenges() }, [leagueId])

  async function cancelChallenge(id: string) {
    const { error } = await supabase
      .from('challenges')
      .update({ status: 'cancelled' } as any)
      .eq('id', id)
    if (error) {
      toast({ title: 'Failed to cancel', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Challenge cancelled' })
      fetchChallenges()
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading challenges…</div>

  // Tabs logic
  const needsAction = challenges.filter(c =>
    (c.status === 'pending_officiator' && c.officiator.id === currentUserId) ||
    (c.status === 'pending_player'     && c.challenged.id === currentUserId)
  )
  const sent     = challenges.filter(c => c.challenger.id === currentUserId)
  const received = challenges.filter(c => c.challenged.id === currentUserId)

  const TABS = [
    { key: 'action',   label: 'Needs action', count: needsAction.length },
    { key: 'sent',     label: 'Sent',         count: sent.length },
    { key: 'received', label: 'Received',     count: received.length },
    { key: 'all',      label: 'All',          count: challenges.length },
  ] as const

  const displayed =
    tab === 'action'   ? needsAction :
    tab === 'sent'     ? sent        :
    tab === 'received' ? received    : challenges

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-5 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${
                tab === t.key ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No challenges here yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(c => {
            const cfg    = STATUS_CONFIG[c.status] ?? { label: c.status, color: 'bg-gray-100 text-gray-500' }
            const isChallenger = c.challenger.id === currentUserId
            const canCancel    = isChallenger &&
              (c.status === 'pending_officiator' || c.status === 'pending_player')

            return (
              <Card key={c.id}>
                <CardContent className="py-4 px-4">
                  {/* Players row */}
                  <div className="flex items-center gap-2 mb-3">
                    <PlayerAvatar
                      name={c.challenger.display_name}
                      color={c.challenger.avatar_color}
                      imageUrl={c.challenger.avatar_url}
                      size="sm"
                    />
                    <span className="text-sm font-medium text-gray-900">{c.challenger.display_name}</span>
                    <Swords className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <PlayerAvatar
                      name={c.challenged.display_name}
                      color={c.challenged.avatar_color}
                      imageUrl={c.challenged.avatar_url}
                      size="sm"
                    />
                    <span className="text-sm font-medium text-gray-900">{c.challenged.display_name}</span>
                    <div className="ml-auto shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{FORMAT_LABELS[c.format] ?? c.format}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      Officiated by <span className="font-medium text-gray-700 ml-1">{c.officiator.display_name}</span>
                    </span>
                    {c.proposed_at && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(c.proposed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </>
                    )}
                    <span>·</span>
                    <span>{timeAgo(c.created_at)}</span>
                  </div>

                  {/* Message */}
                  {c.message && (
                    <p className="mt-2 text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
                      &ldquo;{c.message}&rdquo;
                    </p>
                  )}

                  {/* Cancel button for challenger on pending challenges */}
                  {canCancel && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => cancelChallenge(c.id)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Ban className="w-3 h-3" />
                        Cancel challenge
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
