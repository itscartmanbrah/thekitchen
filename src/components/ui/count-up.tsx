'use client'

import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'

// Animated number that counts up to `value` when it first mounts and whenever
// the value changes. Used for ELO ratings, ranks, and KPI figures.
export function CountUp({
  value,
  decimals = 0,
  duration = 0.8,
  className,
  prefix = '',
  suffix = '',
}: {
  value: number
  decimals?: number
  duration?: number
  className?: string
  prefix?: string
  suffix?: string
}) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) { setDisplay(value); return }
    const controls = animate(from, value, {
      duration,
      ease: 'easeOut',
      onUpdate: v => setDisplay(v),
    })
    return () => controls.stop()
  }, [value, duration])

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString()

  return <span className={className}>{prefix}{formatted}{suffix}</span>
}
