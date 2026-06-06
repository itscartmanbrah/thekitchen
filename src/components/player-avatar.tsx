import { getInitials } from '@/lib/utils'

interface PlayerAvatarProps {
  name: string
  color: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
}

export function PlayerAvatar({ name, color, size = 'md' }: PlayerAvatarProps) {
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}
      style={{ backgroundColor: color }}
    >
      {getInitials(name)}
    </div>
  )
}
