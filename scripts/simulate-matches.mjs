// Simulates a realistic match history between the test users in a league.
//
// Each player gets a hidden "true skill"; results follow it probabilistically,
// so after the batch the leaderboard shows a natural ELO spread, win/loss
// records, recent-form streaks, and singles/doubles rating differences.
// Matches are processed through the real process_match_result RPC so all
// stats (ELO, wins/losses, point_transactions, career highs) are genuine.
//
// Usage: node scripts/simulate-matches.mjs <INVITE_CODE> [numMatches]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const code = process.argv[2]
const NUM_MATCHES = parseInt(process.argv[3] ?? '160')
if (!code) {
  console.error('Usage: node scripts/simulate-matches.mjs <INVITE_CODE> [numMatches]')
  process.exit(1)
}

const { data: league } = await supabase
  .from('leagues').select('id, name').eq('invite_code', code.toUpperCase()).single()
if (!league) { console.error(`League ${code} not found`); process.exit(1) }

// Only simulate among test users so real accounts are untouched
const { data: testProfiles } = await supabase
  .from('profiles').select('id, display_name').like('email', '%@thekitchen.test')
const testIds = new Set((testProfiles ?? []).map(p => p.id))

const { data: members } = await supabase
  .from('league_members')
  .select('user_id')
  .eq('league_id', league.id)
  .eq('status', 'active')

const players = (members ?? []).map(m => m.user_id).filter(id => testIds.has(id))
if (players.length < 4) { console.error('Need at least 4 test players in the league'); process.exit(1) }

const nameOf = new Map((testProfiles ?? []).map(p => [p.id, p.display_name]))

// Hidden true skill: roughly normal around 1000, sd ~170
function gauss() {
  let s = 0
  for (let i = 0; i < 6; i++) s += Math.random()
  return (s - 3) / Math.sqrt(0.5) // ~N(0,1)
}
const skill = new Map(players.map(id => [id, Math.round(1000 + gauss() * 170)]))
// Activity weight: some players play a lot more than others
const activity = new Map(players.map(id => [id, 0.4 + Math.random() * 1.6]))

function weightedPick(exclude = new Set()) {
  const pool = players.filter(p => !exclude.has(p))
  const total = pool.reduce((s, p) => s + activity.get(p), 0)
  let r = Math.random() * total
  for (const p of pool) {
    r -= activity.get(p)
    if (r <= 0) return p
  }
  return pool[pool.length - 1]
}

function winProb(skill1, skill2) {
  return 1 / (1 + Math.pow(10, (skill2 - skill1) / 400))
}

// Realistic pickleball score for a game to 11, given how close the matchup is
function makeScore(pWin) {
  const closeness = 1 - Math.abs(pWin - 0.5) * 2 // 1 = even, 0 = mismatch
  if (Math.random() < 0.15 * closeness + 0.03) {
    // Deuce game
    const extra = Math.random() < 0.7 ? 1 : 2
    return [11 + extra, 9 + extra]
  }
  // Loser score: mismatches end 11-2..11-5, close games 11-7..11-9
  const base = Math.round(2 + closeness * 6)
  const loser = Math.min(9, Math.max(0, base + Math.floor(Math.random() * 3) - 1))
  return [11, loser]
}

const DAYS = 56
const start = Date.now() - DAYS * 24 * 3600 * 1000

let done = 0, failed = 0
for (let i = 0; i < NUM_MATCHES; i++) {
  // 60% singles, 30% doubles, 10% mixed
  const roll = Math.random()
  const format = roll < 0.6 ? 'singles' : roll < 0.9 ? 'doubles' : 'mixed_doubles'
  const perTeam = format === 'singles' ? 1 : 2

  const exclude = new Set()
  const team1 = [], team2 = []
  for (let k = 0; k < perTeam; k++) { const p = weightedPick(exclude); exclude.add(p); team1.push(p) }
  for (let k = 0; k < perTeam; k++) { const p = weightedPick(exclude); exclude.add(p); team2.push(p) }

  const s1 = team1.reduce((s, p) => s + skill.get(p), 0) / perTeam
  const s2 = team2.reduce((s, p) => s + skill.get(p), 0) / perTeam
  const p1 = winProb(s1, s2)
  const team1Wins = Math.random() < p1
  const [w, l] = makeScore(team1Wins ? p1 : 1 - p1)
  const [score1, score2] = team1Wins ? [w, l] : [l, w]

  // Spread timestamps over the past 8 weeks, in order
  const ts = new Date(start + (i / NUM_MATCHES) * DAYS * 24 * 3600 * 1000
    + Math.random() * 3 * 3600 * 1000)

  // Current ELOs for elo_before snapshots
  const ids = [...team1, ...team2]
  const { data: elos } = await supabase
    .from('league_members').select('user_id, elo_rating')
    .eq('league_id', league.id).in('user_id', ids)
  const eloMap = new Map((elos ?? []).map(e => [e.user_id, e.elo_rating]))

  const { data: match, error: mErr } = await supabase.from('matches').insert({
    league_id: league.id,
    format,
    status: 'completed',
    max_points: 11,
    team1_score: score1,
    team2_score: score2,
    created_by: team1[0],
    created_at: ts.toISOString(),
    completed_at: ts.toISOString(),
  }).select('id').single()

  if (mErr || !match) { failed++; console.error(`✗ match ${i + 1}: ${mErr?.message}`); continue }

  const { error: pErr } = await supabase.from('match_players').insert(
    ids.map(uid => ({
      match_id: match.id,
      user_id: uid,
      team: team1.includes(uid) ? 1 : 2,
      elo_before: eloMap.get(uid) ?? 1000,
    }))
  )
  if (pErr) { failed++; console.error(`✗ players ${i + 1}: ${pErr.message}`); continue }

  const { error: rErr } = await supabase.rpc('process_match_result', { p_match_id: match.id })
  if (rErr) { failed++; console.error(`✗ elo ${i + 1}: ${rErr.message}`); continue }

  done++
  if (done % 20 === 0) console.log(`…${done}/${NUM_MATCHES} matches simulated`)
}

console.log(`\nDone — ${done} matches simulated (${failed} failed).`)

// Show final leaderboard
const { data: finalBoard } = await supabase
  .from('league_members')
  .select('user_id, elo_rating, wins, losses')
  .eq('league_id', league.id).eq('status', 'active')
  .order('elo_rating', { ascending: false })
  .limit(10)

console.log('\nTop 10:')
for (const m of finalBoard ?? []) {
  console.log(`  ${String(m.elo_rating).padStart(4)}  ${m.wins}W-${m.losses}L  ${nameOf.get(m.user_id) ?? '(you)'}`)
}
