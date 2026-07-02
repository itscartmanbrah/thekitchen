'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Zap } from 'lucide-react'

const up = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' as const },
})

export function LandingHero() {
  return (
    <section className="max-w-6xl mx-auto px-4 pt-24 pb-16 text-center">
      <style>{`
        @keyframes tk-shine { 0% { background-position: 200% center } 100% { background-position: -200% center } }
        .tk-shiny {
          background: linear-gradient(90deg, #16a34a 0%, #16a34a 35%, #86efac 50%, #16a34a 65%, #16a34a 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent; color: transparent;
          animation: tk-shine 4s linear infinite;
        }
      `}</style>

      <motion.div {...up(0)} className="inline-flex items-center gap-2 bg-green-500/15 text-green-700 dark:text-green-300 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
        <Zap className="w-4 h-4" />
        ELO-powered pickleball rankings
      </motion.div>

      <motion.h1 {...up(1)} className="text-5xl md:text-6xl font-extrabold italic uppercase tracking-tight text-foreground mb-6 leading-[0.95]">
        Run your pickleball league<br />
        <span className="tk-shiny">like a pro.</span>
      </motion.h1>

      <motion.p {...up(2)} className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
        The Kitchen tracks every dink, drive, and drop shot. Create leagues, log matches,
        and watch your ELO rating climb with a fair, margin-aware ranking system.
      </motion.p>

      <motion.div {...up(3)} className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button size="lg" asChild className="text-base px-8">
          <Link href="/signup">Start your league →</Link>
        </Button>
        <Button size="lg" variant="outline" asChild className="text-base px-8">
          <Link href="/login">Sign in</Link>
        </Button>
      </motion.div>
      <motion.p {...up(4)} className="text-sm text-muted-foreground mt-4">Free to create. Invite your crew with a 6-character code.</motion.p>
    </section>
  )
}
