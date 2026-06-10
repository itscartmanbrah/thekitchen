// Creates a test tournament with all standard divisions and registers the
// test users into every division they're eligible for (singles individually,
// doubles/mixed as paired teams).
// Usage: node scripts/seed-test-tournament.mjs <INVITE_CODE> [name]

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
const tournamentName = process.argv[3] ?? 'Club Championship (Test)'
if (!code) { console.error('Usage: node scripts/seed-test-tournament.mjs <INVITE_CODE> [name]'); process.exit(1) }

const DIVISIONS = [
  { name: 'Junior 12 & Under', format: 'singles',       gender: 'open',  max_age: 12 },
  { name: 'Open Men',          format: 'singles',       gender: 'men' },
  { name: 'Open Women',        format: 'singles',       gender: 'women' },
  { name: 'Open Mixed',        format: 'mixed_doubles', gender: 'mixed' },
  { name: '35+ Men',           format: 'singles',       gender: 'men',   min_age: 35 },
  { name: '35+ Mixed',         format: 'mixed_doubles', gender: 'mixed', min_age: 35 },
  { name: 'Beginner Men',      format: 'singles',       gender: 'men',   max_rating: 1000 },
  { name: 'Beginner Women',    format: 'singles',       gender: 'women', max_rating: 1000 },
  { name: 'Beginner Mixed',    format: 'mixed_doubles', gender: 'mixed', max_rating: 1000 },
  { name: 'Novice Women',      format: 'singles',       gender: 'women', max_rating: 875 },
]

const { data: league } = await supabase
  .from('leagues').select('id, name').eq('invite_code', code.toUpperCase()).single()
if (!league) { console.error(`League ${code} not found`); process.exit(1) }

const { data: headAdmin } = await supabase
  .from('league_members').select('user_id')
  .eq('league_id', league.id).eq('role', 'head_admin').limit(1).single()

// Test players with demographics + league rating
const { data: testProfiles } = await supabase
  .from('profiles')
  .select('id, display_name, gender, birthday, email')
  .like('email', '%@thekitchen.test')

const { data: members } = await supabase
  .from('league_members')
  .select('user_id, elo_rating')
  .eq('league_id', league.id).eq('status', 'active')
const eloMap = new Map((members ?? []).map(m => [m.user_id, m.elo_rating]))

const players = (testProfiles ?? [])
  .filter(p => eloMap.has(p.id))
  .map(p => ({
    id: p.id,
    name: p.display_name,
    gender: p.gender,
    age: p.birthday ? Math.floor((Date.now() - new Date(p.birthday).getTime()) / (365.25 * 24 * 3600 * 1000)) : null,
    elo: eloMap.get(p.id),
  }))

function eligible(p, d) {
  if (d.gender === 'men' && p.gender !== 'male') return false
  if (d.gender === 'women' && p.gender !== 'female') return false
  if (d.gender === 'mixed' && !p.gender) return false
  if (d.min_age && (p.age === null || p.age < d.min_age)) return false
  if (d.max_age && (p.age === null || p.age > d.max_age)) return false
  if (d.min_rating && p.elo < d.min_rating) return false
  if (d.max_rating && p.elo > d.max_rating) return false
  return true
}

// Create tournament + divisions
const { data: tournament, error: tErr } = await supabase
  .from('tournaments')
  .insert({ league_id: league.id, name: tournamentName, created_by: headAdmin.user_id })
  .select('id, share_code').single()
if (tErr) { console.error('Failed to create tournament:', tErr.message); process.exit(1) }

console.log(`Tournament "${tournamentName}" created in ${league.name}\n`)

for (const d of DIVISIONS) {
  const { data: div, error: dErr } = await supabase
    .from('tournament_divisions')
    .insert({
      tournament_id: tournament.id,
      name: d.name, format: d.format, gender: d.gender,
      min_age: d.min_age ?? null, max_age: d.max_age ?? null,
      min_rating: d.min_rating ?? null, max_rating: d.max_rating ?? null,
    })
    .select('id').single()
  if (dErr) { console.error(`✗ division ${d.name}: ${dErr.message}`); continue }

  const pool = players.filter(p => eligible(p, d))

  let entries = []
  if (d.format === 'singles') {
    entries = pool.map(p => ({ division_id: div.id, user_id: p.id }))
  } else {
    // Pair into teams; mixed = one male + one female
    const males = pool.filter(p => p.gender === 'male')
    const females = pool.filter(p => p.gender === 'female')
    const teams = Math.min(males.length, females.length)
    for (let i = 0; i < teams; i++) {
      entries.push({ division_id: div.id, user_id: males[i].id, partner_id: females[i].id })
    }
  }

  if (entries.length === 0) {
    console.log(`· ${d.name}: no eligible test players`)
    continue
  }

  const { error: eErr } = await supabase.from('division_entries').insert(entries)
  if (eErr) console.error(`✗ entries for ${d.name}: ${eErr.message}`)
  else console.log(`✓ ${d.name}: ${entries.length} ${d.format === 'singles' ? 'players' : 'teams'} registered`)
}

console.log(`\nDone. Spectator link code: ${tournament.share_code}`)
