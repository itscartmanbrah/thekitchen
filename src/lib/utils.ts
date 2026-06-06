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

export function getEloTier(elo: number): { label: string; color: string } {
  if (elo >= 1400) return { label: 'Elite', color: 'text-yellow-500' }
  if (elo >= 1200) return { label: 'Advanced', color: 'text-purple-500' }
  if (elo >= 1100) return { label: 'Intermediate', color: 'text-blue-500' }
  if (elo >= 950)  return { label: 'Developing', color: 'text-green-500' }
  return { label: 'Beginner', color: 'text-gray-500' }
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
