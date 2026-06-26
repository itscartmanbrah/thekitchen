// Pure pairing/balancing logic for Open Play (client-side; the organizer's
// device decides matchups and persists them via create_session_game).

export interface QueuePlayer {
  id: string
  skill: number
}

export interface Pairing {
  team1: string[]
  team2: string[]
}

// Split exactly 4 players into the two fairest doubles teams (minimize the
// difference between team skill sums). Returns the best of the 3 pairings.
function bestDoublesSplit(four: QueuePlayer[]): Pairing {
  const [a, b, c, d] = four
  const options: [QueuePlayer[], QueuePlayer[]][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ]
  let best = options[0]
  let bestDiff = Infinity
  for (const [t1, t2] of options) {
    const diff = Math.abs((t1[0].skill + t1[1].skill) - (t2[0].skill + t2[1].skill))
    if (diff < bestDiff) { bestDiff = diff; best = [t1, t2] }
  }
  return { team1: best[0].map(p => p.id), team2: best[1].map(p => p.id) }
}

// Given the queue (already in FIFO order) and a format, build as many court
// matchups as possible. Returns the matchups plus the leftover queue.
export function buildMatches(
  queue: QueuePlayer[],
  format: 'singles' | 'doubles',
  openCourts: number,
): { pairings: Pairing[]; usedIds: string[] } {
  const perGame = format === 'doubles' ? 4 : 2
  const pairings: Pairing[] = []
  const usedIds: string[] = []
  let i = 0
  while (pairings.length < openCourts && i + perGame <= queue.length) {
    const group = queue.slice(i, i + perGame)
    if (format === 'doubles') {
      pairings.push(bestDoublesSplit(group))
    } else {
      pairings.push({ team1: [group[0].id], team2: [group[1].id] })
    }
    group.forEach(p => usedIds.push(p.id))
    i += perGame
  }
  return { pairings, usedIds }
}

// How many more players are needed before the next court can start.
export function playersNeeded(queueLength: number, format: 'singles' | 'doubles'): number {
  const perGame = format === 'doubles' ? 4 : 2
  return Math.max(0, perGame - queueLength)
}

// ── Fair rotation (Auto Fill) ───────────────────────────────────────────────
export interface RosterPlayer extends QueuePlayer {
  games: number    // games already played this session
  waitMs: number   // how long they've been waiting
}

// Best doubles split that balances skill AND avoids re-pairing recent partners.
function bestSplitAvoidingRepeats(four: RosterPlayer[], partneredWith: Map<string, Set<string>>): Pairing {
  const [a, b, c, d] = four
  const options: [RosterPlayer[], RosterPlayer[]][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ]
  const repeat = (x: RosterPlayer, y: RosterPlayer) => (partneredWith.get(x.id)?.has(y.id) ? 1 : 0)
  let best = options[0]
  let bestCost = Infinity
  for (const [t1, t2] of options) {
    const skillDiff = Math.abs((t1[0].skill + t1[1].skill) - (t2[0].skill + t2[1].skill))
    const reps = repeat(t1[0], t1[1]) + repeat(t2[0], t2[1])
    const cost = skillDiff + reps * 100000   // repeats dominate; skill breaks ties
    if (cost < bestCost) { bestCost = cost; best = [t1, t2] }
  }
  return { team1: best[0].map(p => p.id), team2: best[1].map(p => p.id) }
}

// King of the Court: winners move up a court, losers move down, re-paired each
// round. `lastRound` maps court number (1 = top) → who won/lost there.
export interface CourtResult { winners: string[]; losers: string[] }

// Re-pair 2–4 ids into the freshest teams (avoid repeat partners).
function repair(ids: string[], partneredWith: Map<string, Set<string>>): Pairing {
  if (ids.length <= 2) return { team1: ids.slice(0, 1), team2: ids.slice(1, 2) }
  const [a, b, c, d] = ids
  const options: [string[], string[]][] = [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]]
  const rep = (x: string, y: string) => (partneredWith.get(x)?.has(y) ? 1 : 0)
  let best = options[0]; let bestCost = Infinity
  for (const [t1, t2] of options) {
    const cost = rep(t1[0], t1[1]) + rep(t2[0], t2[1])
    if (cost < bestCost) { bestCost = cost; best = [t1, t2] }
  }
  return { team1: best[0], team2: best[1] }
}

// `benchExtras` (longest-waiting first) are players who sat out last round. They
// rotate IN through the bottom rung, pushing the bottom's stuck losers out to
// rest — so with more players than court capacity, everyone keeps cycling.
export function buildKingRound(
  lastRound: Map<number, CourtResult>,
  courtCount: number,
  partneredWith: Map<string, Set<string>>,
  benchExtras: string[] = [],
): Pairing[] {
  const groups: Pairing[] = []
  const extras = [...benchExtras]
  for (let c = 1; c <= courtCount; c++) {
    const here = lastRound.get(c)
    if (!here) return []   // incomplete results → caller falls back to a fresh seed
    let roster: string[]
    if (c === 1) {
      roster = [...here.winners, ...(lastRound.get(2)?.winners ?? [])]
    } else if (c === courtCount) {
      const down = lastRound.get(c - 1)?.losers ?? []
      const stayed = here.losers
      const swapN = Math.min(extras.length, stayed.length)   // fresh players replace the stuck
      roster = [...down, ...stayed.slice(swapN), ...extras.splice(0, swapN)]
    } else {
      roster = [...(lastRound.get(c - 1)?.losers ?? []), ...(lastRound.get(c + 1)?.winners ?? [])]
    }
    groups.push(repair(roster, partneredWith))
  }
  return groups
}

// King "keep teams together": keep each player with their most-recent partner
// (when both are playing this round), rank pairs by wins so the strongest pairs
// meet on the top court, then match adjacent pairs. `playing` is already the
// fair selection of who's on this round.
export function buildKingKeepTeams(
  playing: { id: string; wins: number }[],
  lastPartner: Map<string, string>,
  format: 'singles' | 'doubles',
): Pairing[] {
  if (format === 'singles') {
    const groups: Pairing[] = []
    for (let i = 0; i + 2 <= playing.length; i += 2) groups.push({ team1: [playing[i].id], team2: [playing[i + 1].id] })
    return groups
  }
  const here = new Set(playing.map(p => p.id))
  const paired = new Set<string>()
  const pairs: string[][] = []
  for (const p of playing) {
    if (paired.has(p.id)) continue
    const lp = lastPartner.get(p.id)
    const mate = (lp && here.has(lp) && !paired.has(lp))
      ? lp
      : playing.find(q => q.id !== p.id && !paired.has(q.id))?.id
    if (!mate) break
    paired.add(p.id); paired.add(mate)
    pairs.push([p.id, mate])
  }
  const winsOf = (id: string) => playing.find(p => p.id === id)?.wins ?? 0
  pairs.sort((a, b) => (winsOf(b[0]) + winsOf(b[1])) - (winsOf(a[0]) + winsOf(a[1])))
  const groups: Pairing[] = []
  for (let i = 0; i + 2 <= pairs.length; i += 2) groups.push({ team1: pairs[i], team2: pairs[i + 1] })
  return groups
}

// Mexicano round: players already sorted best→worst by standings. On each court
// the top 4 of the remaining play 1&4 vs 2&3, so the closest-ranked players meet.
export function buildMexicanoRound(
  ranked: { id: string }[],
  format: 'singles' | 'doubles',
  maxCourts: number,
): Pairing[] {
  const perGame = format === 'doubles' ? 4 : 2
  const groups: Pairing[] = []
  for (let i = 0; i + perGame <= ranked.length && groups.length < maxCourts; i += perGame) {
    const g = ranked.slice(i, i + perGame)
    groups.push(format === 'doubles'
      ? { team1: [g[0].id, g[3].id], team2: [g[1].id, g[2].id] }
      : { team1: [g[0].id], team2: [g[1].id] })
  }
  return groups
}

// Skill Courts: which court (1 = top/strongest) a given 1–5 level belongs to,
// splitting the level range evenly across the courts.
export function courtForLevel(level: number, courtCount: number): number {
  const c = Math.ceil((6 - level) * courtCount / 5)
  return Math.min(courtCount, Math.max(1, c))
}

// Skill-separated: group players whose skill levels are within `window` of each
// other (default 2), preferring the fewest-games first. Players who can't fit a
// tight group wait rather than be forced into a wide-gap match.
export function buildSkillGroups(
  bench: { id: string; level: number; games: number }[],
  format: 'singles' | 'doubles',
  maxGroups: number,
  window: number,
): Pairing[] {
  const perGame = format === 'doubles' ? 4 : 2
  const sorted = [...bench].sort((a, b) => a.level - b.level || a.games - b.games)
  const used = new Array(sorted.length).fill(false)
  const groups: Pairing[] = []
  for (let s = 0; s < sorted.length && groups.length < maxGroups; s++) {
    if (used[s]) continue
    const grp = [s]
    for (let j = s + 1; j < sorted.length && grp.length < perGame; j++) {
      if (used[j]) continue
      if (sorted[j].level - sorted[s].level <= window) grp.push(j); else break
    }
    if (grp.length === perGame) {
      grp.forEach(k => (used[k] = true))
      const id = grp.map(k => sorted[k].id)
      groups.push(format === 'doubles'
        ? { team1: [id[0], id[3]], team2: [id[1], id[2]] }
        : { team1: [id[0]], team2: [id[1]] })
    }
  }
  return groups
}

// Mixed doubles: every game is two men vs… needs 2 men + 2 women, paired as one
// man + one woman per team. Players without a gender set wait.
export function buildMixedGroups(
  bench: { id: string; gender: string | null; games: number }[],
  maxGroups: number,
): Pairing[] {
  const men = bench.filter(p => p.gender === 'm').sort((a, b) => a.games - b.games)
  const women = bench.filter(p => p.gender === 'f').sort((a, b) => a.games - b.games)
  const groups: Pairing[] = []
  while (groups.length < maxGroups && men.length >= 2 && women.length >= 2) {
    const m1 = men.shift()!, m2 = men.shift()!, w1 = women.shift()!, w2 = women.shift()!
    groups.push({ team1: [m1.id, w1.id], team2: [m2.id, w2.id] })
  }
  return groups
}

// Build up to `maxGroups` balanced groups from the bench, prioritising players
// who've played fewest games (then waited longest), and avoiding repeat partners.
export function buildFairGroups(
  bench: RosterPlayer[],
  format: 'singles' | 'doubles',
  maxGroups: number,
  partneredWith: Map<string, Set<string>>,
): Pairing[] {
  const perGame = format === 'doubles' ? 4 : 2
  const ordered = [...bench].sort((a, b) => a.games - b.games || b.waitMs - a.waitMs)
  const groups: Pairing[] = []
  let i = 0
  while (groups.length < maxGroups && i + perGame <= ordered.length) {
    const group = ordered.slice(i, i + perGame)
    groups.push(format === 'doubles'
      ? bestSplitAvoidingRepeats(group, partneredWith)
      : { team1: [group[0].id], team2: [group[1].id] })
    i += perGame
  }
  return groups
}
