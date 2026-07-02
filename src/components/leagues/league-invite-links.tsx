'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { generateInviteCode } from '@/lib/utils'
import { Copy, Check, Plus, Trash2, Link as LinkIcon } from 'lucide-react'

interface InviteLink {
  id: string; code: string; label: string | null
  used_count: number; is_active: boolean; created_at: string; expires_at: string | null
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground hover:text-green-300 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {code}
    </button>
  )
}

export function LeagueInviteLinks({ leagueId }: { leagueId: string }) {
  const [links, setLinks] = useState<InviteLink[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  async function fetch() {
    const { data } = await supabase
      .from('invite_links')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
    setLinks((data as InviteLink[]) ?? [])
  }

  useEffect(() => { fetch() }, [leagueId])

  async function create() {
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const code = generateInviteCode()
    const { error } = await supabase.from('invite_links').insert({
      league_id: leagueId,
      code,
      label: newLabel.trim() || null,
      created_by: user.id,
    } as any)
    if (error) {
      toast({ title: 'Failed to create link', description: error.message, variant: 'destructive' })
    } else {
      setNewLabel(''); setShowForm(false); fetch()
    }
    setCreating(false)
  }

  async function toggle(id: string, current: boolean) {
    await supabase.from('invite_links').update({ is_active: !current } as any).eq('id', id)
    fetch()
  }

  async function remove(id: string) {
    await supabase.from('invite_links').delete().eq('id', id)
    fetch()
  }

  return (
    <div className="space-y-2">
      {links.map(l => (
        <div key={l.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${l.is_active ? 'bg-card' : 'bg-muted/40 opacity-60'}`}>
          <LinkIcon className="w-3.5 h-3.5 text-muted-foreground/80 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CopyCode code={l.code} />
              {l.label && <span className="text-xs text-muted-foreground truncate">{l.label}</span>}
              <Badge variant={l.is_active ? 'success' : 'outline'} className="text-xs">
                {l.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground/80 mt-0.5">Used {l.used_count}×</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggle(l.id, l.is_active)}>
              {l.is_active ? 'Disable' : 'Enable'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-400" onClick={() => remove(l.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="flex gap-2 items-center p-2 border rounded-lg bg-muted/40">
          <Input
            placeholder="Label (optional, e.g. Spring 2025)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="h-8 text-sm flex-1"
            onKeyDown={e => e.key === 'Enter' && create()}
            autoFocus
          />
          <Button size="sm" onClick={create} disabled={creating}>{creating ? '…' : 'Create'}</Button>
          <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" />
          New invite link
        </Button>
      )}
    </div>
  )
}
