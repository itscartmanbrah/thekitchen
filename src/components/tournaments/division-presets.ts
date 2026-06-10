// Standard tournament division presets.
// Rating cutoffs are ELO values (1000 ELO = DUPR 3.50, 875 = 3.00).

export interface DivisionConfig {
  name: string
  format: 'singles' | 'doubles' | 'mixed_doubles'
  bracket_type: 'single_elim' | 'round_robin'
  gender: 'open' | 'men' | 'women' | 'mixed'
  min_age?: number | null
  max_age?: number | null
  min_rating?: number | null
  max_rating?: number | null
}

export const SKILL_CUTOFFS = {
  novice: 875,    // DUPR < 3.00
  beginner: 1000, // DUPR < 3.50
}

export const DIVISION_PRESETS: DivisionConfig[] = [
  { name: 'Junior 12 & Under', format: 'singles',       bracket_type: 'single_elim', gender: 'open',  max_age: 12 },
  { name: 'Open Men',          format: 'singles',       bracket_type: 'single_elim', gender: 'men' },
  { name: 'Open Women',        format: 'singles',       bracket_type: 'single_elim', gender: 'women' },
  { name: 'Open Mixed',        format: 'mixed_doubles', bracket_type: 'single_elim', gender: 'mixed' },
  { name: '35+ Men',           format: 'singles',       bracket_type: 'single_elim', gender: 'men',   min_age: 35 },
  { name: '35+ Mixed',         format: 'mixed_doubles', bracket_type: 'single_elim', gender: 'mixed', min_age: 35 },
  { name: 'Beginner Men',      format: 'singles',       bracket_type: 'single_elim', gender: 'men',   max_rating: SKILL_CUTOFFS.beginner },
  { name: 'Beginner Women',    format: 'singles',       bracket_type: 'single_elim', gender: 'women', max_rating: SKILL_CUTOFFS.beginner },
  { name: 'Beginner Mixed',    format: 'mixed_doubles', bracket_type: 'single_elim', gender: 'mixed', max_rating: SKILL_CUTOFFS.beginner },
  { name: 'Novice Women',      format: 'singles',       bracket_type: 'single_elim', gender: 'women', max_rating: SKILL_CUTOFFS.novice },
]

export const FORMAT_LABELS: Record<string, string> = {
  singles: 'Singles', doubles: 'Doubles', mixed_doubles: 'Mixed Doubles',
}

export const GENDER_LABELS: Record<string, string> = {
  open: 'Open', men: 'Men', women: 'Women', mixed: 'Mixed',
}

export function divisionRuleSummary(d: DivisionConfig): string {
  const parts: string[] = [FORMAT_LABELS[d.format] ?? d.format, GENDER_LABELS[d.gender] ?? d.gender]
  if (d.min_age) parts.push(`${d.min_age}+`)
  if (d.max_age) parts.push(`${d.max_age} & under`)
  if (d.max_rating) parts.push(`under ${(3.5 + (d.max_rating - 1000) / 250).toFixed(1)} rating`)
  if (d.min_rating) parts.push(`${(3.5 + (d.min_rating - 1000) / 250).toFixed(1)}+ rating`)
  parts.push(d.bracket_type === 'round_robin' ? 'Round robin' : 'Single elim')
  return parts.join(' · ')
}
