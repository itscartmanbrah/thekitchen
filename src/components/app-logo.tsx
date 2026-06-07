export function AppLogo({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="The Kitchen" className={`${className} object-contain shrink-0`} />
  )
}
