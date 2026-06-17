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
