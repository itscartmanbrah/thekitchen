// Remembers the standalone Open Play session this device is hosting, so the
// organizer can get back to it (Resume) after navigating away.
export interface ActiveHost { manageCode: string; shareCode: string; name: string }

const KEY = 'kitchen_active_host'

export function setActiveHost(h: ActiveHost) {
  try { localStorage.setItem(KEY, JSON.stringify(h)) } catch { /* ignore */ }
}
export function getActiveHost(): ActiveHost | null {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as ActiveHost) : null } catch { return null }
}
export function clearActiveHost() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
