// Adds all @thekitchen.test test users to a league as active players.
// Usage: node scripts/add-test-users-to-league.mjs <INVITE_CODE>

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
if (!code) {
  console.error('Usage: node scripts/add-test-users-to-league.mjs <INVITE_CODE>')
  process.exit(1)
}

const { data: league, error: leagueError } = await supabase
  .from('leagues').select('id, name').eq('invite_code', code.toUpperCase()).single()
if (leagueError || !league) {
  console.error(`League with code ${code} not found`)
  process.exit(1)
}

const { data: testUsers } = await supabase
  .from('profiles').select('id, display_name').like('email', '%@thekitchen.test')

if (!testUsers?.length) {
  console.error('No test users found')
  process.exit(1)
}

let added = 0
for (const u of testUsers) {
  const { error } = await supabase.from('league_members').upsert({
    league_id: league.id,
    user_id: u.id,
    role: 'player',
    status: 'active',
    elo_rating: 1000,
  }, { onConflict: 'league_id,user_id' })

  if (error) console.error(`✗ ${u.display_name}: ${error.message}`)
  else { added++; console.log(`✓ ${u.display_name}`) }
}

console.log(`\nDone — ${added}/${testUsers.length} added to "${league.name}" as active players.`)
