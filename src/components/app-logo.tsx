// The Kitchen "Toque" mark — blue chef's hat on an ink pickleball paddle.
// Inline SVG driven by theme tokens: the hat follows primary (blue-600 light /
// blue-500 dark) and the paddle follows foreground, so it adapts to light/dark
// automatically. Pass onDark for surfaces that are ALWAYS dark regardless of
// theme (recap card, board view).
export function AppLogo({ className = 'w-7 h-7', onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="The Kitchen" className={`${className} shrink-0`}>
      <g fill="currentColor" className={onDark ? 'text-blue-500' : 'text-primary'}>
        <circle cx="25" cy="12.5" r="4.5" />
        <circle cx="32" cy="10.5" r="5.5" />
        <circle cx="39" cy="12.5" r="4.5" />
        <rect x="20.5" y="11" width="23" height="6.5" rx="2" />
        <rect x="24" y="19.5" width="16" height="4" rx="2" />
      </g>
      <g fill="currentColor" className={onDark ? 'text-white' : 'text-foreground'}>
        <rect x="21.5" y="26" width="21" height="25" rx="8.5" />
        <rect x="29.5" y="49.5" width="5" height="10" rx="2.5" />
      </g>
    </svg>
  )
}
