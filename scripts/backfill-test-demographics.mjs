// Backfills gender + birthday for the test users so gendered and age-limited
// tournament divisions are testable. Ages are spread: a few juniors (≤12),
// a healthy 35+ group, and the rest 18–34.
// Usage: node scripts/backfill-test-demographics.mjs

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

const MALE = new Set([
  'Mason', 'Liam', 'Noah', 'Ethan', 'Lucas', 'Jackson', 'Aiden', 'Carter', 'Wyatt', 'Julian',
  'Diego', 'Marcus', 'Gabriel', 'Owen', 'Felix', 'Theo', 'Caleb', 'Rafael', 'Hugo', 'Silas',
])

const { data: users } = await supabase
  .from('profiles')
  .select('id, first_name, display_name, email')
  .like('email', '%@thekitchen.test')
  .order('email')

if (!users?.length) { console.error('No test users found'); process.exit(1) }

function birthdayForAge(age) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - age)
  d.setMonth(Math.floor(Math.random() * 12))
  d.setDate(1 + Math.floor(Math.random() * 27))
  return d.toISOString().split('T')[0]
}

let updated = 0
for (let i = 0; i < users.length; i++) {
  const u = users[i]
  const gender = MALE.has(u.first_name) ? 'male' : 'female'

  // Age mix: 3 juniors (11–12), ~30% are 35–55, rest 18–34
  let age
  if (i % 13 === 0) age = 11 + Math.floor(Math.random() * 2)
  else if (i % 3 === 0) age = 35 + Math.floor(Math.random() * 21)
  else age = 18 + Math.floor(Math.random() * 17)

  const { error } = await supabase
    .from('profiles')
    .update({ gender, birthday: birthdayForAge(age) })
    .eq('id', u.id)

  if (error) console.error(`✗ ${u.display_name}: ${error.message}`)
  else { updated++; console.log(`✓ ${u.display_name} — ${gender}, age ${age}`) }
}

console.log(`\nDone — ${updated}/${users.length} profiles updated.`)
