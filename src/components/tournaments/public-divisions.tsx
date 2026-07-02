'use client'

import { useState } from 'react'
import { TournamentBracket, type BracketMatch, type BracketPlayer } from '@/components/tournaments/tournament-bracket'
import { PlayerAvatar } from '@/components/player-avatar'

interface PubEntry {
  id: string
  seed: number | null
  name: string
  avatar_color: string
  avatar_url: string | null
}

interface PubMatch {
  id: string
  round: number
  position: number
  entry1_id: string | null
  entry2_id: string | null
  winner_entry_id: string | null
  score1: number | null
  score2: number | null
  status: 'pending' | 'ready' | 'completed' | 'bye'
}

interface PubDivision {
  id: string
  name: string
  format: string
  bracket_type: string
  status: string
  winner_entry_id: string | null
  entries: PubEntry[]
  matches: PubMatch[]
}

function standingsFor(entries: PubEntry[], matches: PubMatch[]) {
  return entries.map(e => {
    let wins = 0, losses = 0, diff = 0
    for (const m of matches) {
      if (m.status !== 'completed') continue
      if (m.entry1_id === e.id) {
        diff += (m.score1 ?? 0) - (m.score2 ?? 0)
        if (m.winner_entry_id === e.id) wins++; else losses++
      } else if (m.entry2_id === e.id) {
        diff += (m.score2 ?? 0) - (m.score1 ?? 0)
        if (m.winner_entry_id === e.id) wins++; else losses++
      }
    }
    return { entry: e, wins, losses, diff }
  }).sort((a, b) => b.wins - a.wins || b.diff - a.diff)
}

export function PublicDivisions({ divisions }: { divisions: PubDivision[] }) {
  const [activeId, setActiveId] = useState(divisions[0]?.id)
  const active = divisions.find(d => d.id === activeId) ?? divisions[0]
  if (!active) return null

  const entryMap = new Map(active.entries.map(e => [e.id, e]))
  const winner = active.winner_entry_id ? entryMap.get(active.winner_entry_id) : null

  const bracketPlayers: BracketPlayer[] = active.entries.map(e => ({
    user_id: e.id, seed: e.seed ?? 0,
    display_name: e.name, avatar_color: e.avatar_color, avatar_url: e.avatar_url,
  }))
  const bracketMatches: BracketMatch[] = active.matches.map(m => ({
    id: m.id, round: m.round, position: m.position,
    player1_id: m.entry1_id, player2_id: m.entry2_id,
    winner_id: m.winner_entry_id, score1: m.score1, score2: m.score2,
    status: m.status,
  }))

  const standings = active.bracket_type === 'round_robin'
    ? standingsFor(active.entries, active.matches)
    : []

  return (
    <div>
      {/* Division tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {divisions.map(d => (
          <button
            key={d.id}
            onClick={() => setActiveId(d.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              d.id === active.id
                ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-300 font-medium'
                : 'border-border text-muted-foreground hover:border-border bg-card'
            }`}
          >
            {d.name}
            {d.status === 'completed' && ' 🏆'}
          </button>
        ))}
      </div>

      {winner && (
        <div className="mb-4 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-1.5">
          <span className="text-lg">🏆</span>
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{winner.name} wins {active.name}!</span>
        </div>
      )}

      {active.status === 'registration' ? (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Registration is open — {active.entries.length} entered so far.
          </p>
          <div className="space-y-1.5 max-w-md">
            {active.entries.map(e => (
              <div key={e.id} className="flex items-center gap-2.5 bg-card border rounded-lg px-3 py-2">
                <PlayerAvatar name={e.name} color={e.avatar_color} imageUrl={e.avatar_url} size="sm" />
                <span className="text-sm font-medium text-foreground truncate">{e.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : active.bracket_type === 'round_robin' ? (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Standings</p>
            <div className="rounded-xl border overflow-hidden bg-card max-w-md">
              {standings.map((s, i) => (
                <div key={s.entry.id} className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 ${
                  active.winner_entry_id === s.entry.id ? 'bg-amber-500/10' : ''
                }`}>
                  <span className="text-xs font-bold text-muted-foreground/80 w-5">{i + 1}</span>
                  <PlayerAvatar name={s.entry.name} color={s.entry.avatar_color} imageUrl={s.entry.avatar_url} size="sm" />
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{s.entry.name}</span>
                  <span className="text-xs text-muted-foreground">{s.wins}W–{s.losses}L</span>
                  <span className={`text-xs font-mono w-12 text-right ${s.diff > 0 ? 'text-green-400' : s.diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground/80'}`}>
                    {s.diff > 0 ? '+' : ''}{s.diff}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Matches</p>
            <div className="space-y-1.5 max-w-md">
              {active.matches.map(m => {
                const e1 = m.entry1_id ? entryMap.get(m.entry1_id) : null
                const e2 = m.entry2_id ? entryMap.get(m.entry2_id) : null
                return (
                  <div key={m.id} className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
                    <span className={`text-sm flex-1 text-right truncate ${m.winner_entry_id === m.entry1_id ? 'font-semibold' : ''}`}>{e1?.name}</span>
                    {m.status === 'completed' ? (
                      <span className="text-sm font-bold text-foreground/90 px-2 shrink-0">{m.score1} – {m.score2}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/80 px-2 shrink-0">vs</span>
                    )}
                    <span className={`text-sm flex-1 truncate ${m.winner_entry_id === m.entry2_id ? 'font-semibold' : ''}`}>{e2?.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <TournamentBracket players={bracketPlayers} matches={bracketMatches} />
      )}
    </div>
  )
}
