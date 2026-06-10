'use client'

import { PlayerAvatar } from '@/components/player-avatar'
import { Trophy } from 'lucide-react'

export interface BracketPlayer {
  user_id: string
  seed: number
  display_name: string
  avatar_color: string
  avatar_url: string | null
}

export interface BracketMatch {
  id: string
  round: number
  position: number
  player1_id: string | null
  player2_id: string | null
  winner_id: string | null
  score1: number | null
  score2: number | null
  status: 'pending' | 'ready' | 'completed' | 'bye'
}

function roundLabel(round: number, totalRounds: number) {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round ${round}`
}

function Slot({
  player, seed, score, isWinner, isBye,
}: {
  player?: BracketPlayer
  seed?: number
  score: number | null
  isWinner: boolean
  isBye: boolean
}) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 ${isWinner ? 'bg-green-50' : ''}`}>
      {player ? (
        <>
          <span className="text-[10px] text-gray-400 w-4 text-right shrink-0">{seed}</span>
          <PlayerAvatar name={player.display_name} color={player.avatar_color} imageUrl={player.avatar_url} size="xs" />
          <span className={`text-xs truncate flex-1 ${isWinner ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
            {player.display_name}
          </span>
          {score !== null && (
            <span className={`text-xs font-bold shrink-0 ${isWinner ? 'text-green-700' : 'text-gray-400'}`}>
              {score}
            </span>
          )}
        </>
      ) : (
        <span className="text-xs text-gray-300 italic pl-6">{isBye ? 'Bye' : 'TBD'}</span>
      )}
    </div>
  )
}

export function TournamentBracket({
  players, matches, canReport = false, onReport,
}: {
  players: BracketPlayer[]
  matches: BracketMatch[]
  canReport?: boolean
  onReport?: (match: BracketMatch) => void
}) {
  const playerMap = new Map(players.map(p => [p.user_id, p]))
  const totalRounds = Math.max(...matches.map(m => m.round), 1)
  const rounds: BracketMatch[][] = []
  for (let r = 1; r <= totalRounds; r++) {
    rounds.push(matches.filter(m => m.round === r).sort((a, b) => a.position - b.position))
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-6 min-w-fit">
        {rounds.map((roundMatches, i) => (
          <div key={i} className="flex flex-col justify-around gap-3 min-w-[220px]">
            <p className="text-xs font-semibold text-gray-500 text-center -mb-1 flex items-center justify-center gap-1">
              {i === totalRounds - 1 && <Trophy className="w-3 h-3 text-amber-500" />}
              {roundLabel(i + 1, totalRounds)}
            </p>
            {roundMatches.map(m => {
              const p1 = m.player1_id ? playerMap.get(m.player1_id) : undefined
              const p2 = m.player2_id ? playerMap.get(m.player2_id) : undefined
              const reportable = canReport && m.status === 'ready' && onReport
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border bg-white divide-y ${
                    m.status === 'completed' ? 'border-gray-200' :
                    m.status === 'ready' ? 'border-green-300 shadow-sm' : 'border-gray-100'
                  } ${reportable ? 'cursor-pointer hover:border-green-500 transition-colors' : ''}`}
                  onClick={() => reportable && onReport(m)}
                  title={reportable ? 'Click to enter score' : undefined}
                >
                  <Slot player={p1} seed={p1?.seed} score={m.score1} isWinner={!!m.winner_id && m.winner_id === m.player1_id} isBye={m.status === 'bye'} />
                  <Slot player={p2} seed={p2?.seed} score={m.score2} isWinner={!!m.winner_id && m.winner_id === m.player2_id} isBye={m.status === 'bye'} />
                  {reportable && (
                    <p className="text-[10px] text-center text-green-600 font-medium py-0.5 bg-green-50/50">Enter score</p>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
