// Second batch of test users (testplayer21–40).
// Usage: node scripts/seed-test-users-2.mjs

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

const PASSWORD = 'TestPass123!'

const PEOPLE = [
  ['Diego', 'Fuentes', 'El Gato'], ['Hannah', 'Petrov', null], ['Marcus', 'Oyelaran', null],
  ['Lily', 'Sørensen', 'Lils'], ['Gabriel', 'Moreau', null], ['Zoe', 'Calloway', 'Zippy'],
  ['Owen', 'Takahashi', null], ['Ruby', 'Vance', null], ['Felix', 'Aguilar', 'Flex'],
  ['Nora', 'Kavanagh', null], ['Theo', 'Lindgren', null], ['Stella', 'Romano', 'Stell'],
  ['Caleb', 'Mensah', null], ['Violet', 'Harlow', null], ['Rafael', 'Domingo', 'Rafa'],
  ['Ivy', 'Beaumont', null], ['Hugo', 'Almeida', null], ['Daisy', 'McAllister', 'Dee'],
  ['Silas', 'Vukovic', null], ['Penelope', 'Ashford', 'Penny'],
]

const AVATAR_COLORS = ['#16a34a', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#6366f1']

let created = 0
for (let i = 0; i < PEOPLE.length; i++) {
  const [first, last, nickname] = PEOPLE[i]
  const email = `testplayer${i + 21}@thekitchen.test`
  const displayName = nickname ?? `${first} ${last}`
  const avatarColor = AVATAR_COLORS[(i + 3) % AVATAR_COLORS.length]

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: first, last_name: last, nickname,
      display_name: displayName, avatar_color: avatarColor,
    },
  })

  if (error) {
    console.error(`✗ ${email}: ${error.message}`)
    continue
  }

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: data.user.id,
    email,
    first_name: first,
    last_name: last,
    nickname,
    display_name: displayName,
    avatar_color: avatarColor,
  })

  if (profileError) {
    console.error(`✗ profile for ${email}: ${profileError.message}`)
    continue
  }

  created++
  console.log(`✓ ${displayName} <${email}>`)
}

console.log(`\nDone — ${created}/${PEOPLE.length} users created. Password for all: ${PASSWORD}`)
