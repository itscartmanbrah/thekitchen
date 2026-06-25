'use client'

import { useEffect, useState } from 'react'

// A self-ticking mm:ss timer. Each instance re-renders only itself once a
// second, so the parent (e.g. the whole Open Play console) doesn't re-render.
export function LiveTimer({
  from, prefix = '', overtimeMin, className, overtimeClassName,
}: {
  from: string
  prefix?: string
  overtimeMin?: number
  className?: string
  overtimeClassName?: string
}) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const s = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000))
  const m = Math.floor(s / 60)
  const mmss = `${m}:${String(s % 60).padStart(2, '0')}`

  if (overtimeMin != null && m >= overtimeMin) {
    return <span className={overtimeClassName}>Overtime {mmss}</span>
  }
  return <span className={className}>{prefix}{mmss}</span>
}
