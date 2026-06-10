import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function formatElo(elo: number): string {
  return Math.round(elo).toLocaleString()
}

// Tier thresholds aligned with the DUPR-style scale in getPickleballRating
// (1000 ELO = 3.50, one rating point per 250 ELO).
export function getEloTier(elo: number): { label: string; color: string } {
  if (elo >= 1375) return { label: 'Elite', color: 'text-yellow-500' }        // 5.0+
  if (elo >= 1250) return { label: 'Tournament', color: 'text-orange-500' }   // 4.5+
  if (elo >= 1125) return { label: 'Advanced', color: 'text-purple-500' }     // 4.0+
  if (elo >= 1000) return { label: 'Intermediate', color: 'text-blue-500' }   // 3.5+
  if (elo >= 875)  return { label: 'Developing', color: 'text-green-500' }    // 3.0+
  return { label: 'Beginner', color: 'text-gray-500' }
}

export interface PickleballRating {
  rating: string   // e.g. "3.5"
  label: string    // e.g. "Intermediate"
  description: string
  color: string
}

// Continuous DUPR-style rating (2.00–8.00), like DUPR's dynamic scale.
// 1000 ELO (league average) maps to 3.50; every 250 ELO is one rating point.
//   750 → 2.50 · 1000 → 3.50 · 1125 → 4.00 · 1250 → 4.50 · 1500 → 5.50 · 2000 → 7.50
export function getPickleballRating(elo: number): PickleballRating {
  const value = Math.min(8, Math.max(2, 3.5 + (elo - 1000) / 250))
  const rating = value.toFixed(2)

  if (value >= 6.0) return { rating, label: 'Pro',                description: 'Competes at the professional level',                          color: 'text-yellow-500' }
  if (value >= 5.0) return { rating, label: 'Elite',              description: 'Competes at the highest amateur level',                       color: 'text-amber-500' }
  if (value >= 4.5) return { rating, label: 'Tournament Player',  description: 'Consistently wins at local tournaments, strong all-round game', color: 'text-orange-500' }
  if (value >= 4.0) return { rating, label: 'Advanced',           description: 'Power, spin, and solid strategy on every shot',               color: 'text-purple-500' }
  if (value >= 3.5) return { rating, label: 'Intermediate+',      description: 'More consistent, developing tactics and court awareness',      color: 'text-blue-500' }
  if (value >= 3.0) return { rating, label: 'Intermediate',       description: 'Reliable groundstrokes, understands positioning',             color: 'text-green-600' }
  if (value >= 2.5) return { rating, label: 'Beginner+',          description: 'Can sustain rallies, learning the kitchen rules',             color: 'text-green-500' }
  return                   { rating, label: 'Beginner',           description: 'Basic shots, still learning scoring and positioning',         color: 'text-gray-500' }
}

export const BANNER_COLORS = [
  '#16a34a', // green
  '#2563eb', // blue
  '#dc2626', // red
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#be185d', // pink
  '#854d0e', // brown
] as const

export const AVATAR_COLORS = [
  '#16a34a', '#2563eb', '#dc2626', '#9333ea',
  '#ea580c', '#0891b2', '#be185d', '#854d0e',
]

export function pickAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
