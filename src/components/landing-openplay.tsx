'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Crown, Repeat, TrendingUp, ListOrdered, Wand2, Monitor, QrCode, BarChart3,
} from 'lucide-react'

const styles = [
  { icon: ListOrdered, name: 'Drop-in', desc: 'Queue + courts. People come and go; the bench rotates fairly.' },
  { icon: Crown, name: 'King of the Court', desc: 'Winners move up, losers move down. Works on a single court.' },
  { icon: Repeat, name: 'Americano', desc: 'Rotate partners every round; ranked by total points.' },
  { icon: TrendingUp, name: 'Mexicano', desc: 'Re-pairs by the live standings so games stay tight.' },
]

const caps = [
  { icon: Wand2, label: 'Auto-balanced, fair rotation' },
  { icon: Monitor, label: 'Live TV board for the venue' },
  { icon: QrCode, label: 'No-account check-in from any phone' },
  { icon: BarChart3, label: 'Scores feed your real ELO' },
]

const up = (i: number) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { delay: i * 0.07, duration: 0.5, ease: 'easeOut' as const },
})

export function LandingOpenPlay() {
  return (
    <section className="bg-zinc-950 text-white py-20 sm:py-24 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div {...up(0)} className="text-center mb-12">
          <span className="inline-block text-[11px] font-bold uppercase tracking-[0.25em] text-green-400 mb-3">The flagship feature</span>
          <h2 className="text-3xl sm:text-5xl font-extrabold italic uppercase tracking-tight leading-[0.95]">
            Open Play,<br /><span className="text-green-400">done right.</span>
          </h2>
          <p className="text-zinc-400 mt-5 max-w-2xl mx-auto text-base sm:text-lg">
            Run drop-in sessions like a pro tournament. Auto-balanced matchups, fair rotation, a live
            board for the wall — and four real play formats most apps don&apos;t have. This is what sets The Kitchen apart.
          </p>
        </motion.div>

        {/* Play styles */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          {styles.map((s, i) => (
            <motion.div key={s.name} {...up(i + 1)}
              className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 hover:border-green-500/50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center mb-3">
                <s.icon className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="font-bold italic uppercase tracking-tight text-white mb-1">{s.name}</h3>
              <p className="text-sm text-zinc-400 leading-snug">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Capability strip */}
        <motion.div {...up(5)} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          {caps.map(c => (
            <div key={c.label} className="flex items-center gap-3 rounded-xl bg-zinc-900/60 border border-zinc-800 px-4 py-3">
              <c.icon className="w-5 h-5 text-green-400 shrink-0" />
              <span className="text-sm text-zinc-200">{c.label}</span>
            </div>
          ))}
        </motion.div>

        <motion.div {...up(6)} className="text-center">
          <Link href="/play/new"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-zinc-950 font-bold rounded-xl px-7 py-3 text-base transition-colors">
            Run a session now →
          </Link>
          <p className="text-xs text-zinc-500 mt-3">No sign-up needed · players join from a link, no app needed</p>
        </motion.div>
      </div>
    </section>
  )
}
