'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Megaphone, X, Plus } from 'lucide-react'

interface Announcement { id: string; content: string; created_at: string }

export function LeagueAnnouncements({ leagueId, isAdmin }: { leagueId: string; isAdmin: boolean }) {
  const [items, setItems] = useState<Announcement[]>([])
  const [draft, setDraft] = useState('')
  const [composing, setComposing] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  async function fetch() {
    const { data } = await supabase
      .from('league_announcements')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
    setItems((data as Announcement[]) ?? [])
  }

  useEffect(() => { fetch() }, [leagueId])

  async function post() {
    if (!draft.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('league_announcements').insert({
      league_id: leagueId,
      content: draft.trim(),
      created_by: user.id,
    } as any)
    if (error) {
      toast({ title: 'Failed to post', description: error.message, variant: 'destructive' })
    } else {
      setDraft(''); setComposing(false); fetch()
    }
    setSaving(false)
  }

  async function remove(id: string) {
    await supabase.from('league_announcements').delete().eq('id', id)
    fetch()
  }

  if (items.length === 0 && !isAdmin) return null

  return (
    <div className="mb-5">
      {items.map(a => (
        <div key={a.id} className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-2">
          <Megaphone className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 flex-1 leading-relaxed">{a.content}</p>
          {isAdmin && (
            <button onClick={() => remove(a.id)} className="text-amber-400 hover:text-amber-600 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {isAdmin && (
        composing ? (
          <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
            <Textarea
              placeholder="Write an announcement…"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={2}
              className="text-sm"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setComposing(false); setDraft('') }}>Cancel</Button>
              <Button size="sm" onClick={post} disabled={saving || !draft.trim()}>
                {saving ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add announcement
          </button>
        )
      )}
    </div>
  )
}
