import { createClient } from '@/lib/supabase/client'

// On every device, joining an Open Play session via the share/QR link stores the
// guest player id under `play_<shareCode>`. After the user signs up or logs in,
// we link those guest rows to their account so their games show up in history.
export async function claimOpenPlayGuests() {
  if (typeof window === 'undefined') return
  const ids: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('play_')) {
      const v = localStorage.getItem(key)
      if (v) ids.push(v)
    }
  }
  if (ids.length === 0) return
  try {
    const supabase = createClient()
    const { error } = await supabase.rpc('claim_open_play_guests', { p_player_ids: ids })
    // Clear the keys whether or not every id linked (already-claimed/stale ids are
    // harmless), so we don't keep retrying forever.
    if (!error) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key && key.startsWith('play_')) localStorage.removeItem(key)
      }
    }
  } catch { /* non-fatal — history just won't include guest games */ }
}
