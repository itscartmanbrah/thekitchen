import Link from 'next/link'
import { TrendingUp, Trophy, Swords, ArrowRight, BookOpen } from 'lucide-react'

const guides = [
  {
    href: '/elo',
    icon: TrendingUp,
    title: 'How ELO works',
    desc: 'The margin-aware ranking system, how points move, and what your rating means.',
  },
  {
    href: '/tournaments-guide',
    icon: Trophy,
    title: 'How tournaments work',
    desc: 'Brackets, tiers, seeding, and why a player can already show as a winner.',
  },
  {
    href: '/open-play-guide',
    icon: Swords,
    title: 'How Open Play works',
    desc: 'Running drop-in sessions, auto-balancing courts, the queue, and self check-in.',
  },
]

export default function HelpPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="w-5 h-5 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; guides</h1>
      </div>
      <p className="text-gray-500 mb-6">Everything about how The Kitchen works, in one place.</p>

      <div className="space-y-3">
        {guides.map(g => (
          <Link
            key={g.href}
            href={g.href}
            className="group flex items-center gap-4 rounded-xl border bg-white p-4 hover:border-green-300 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <g.icon className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900">{g.title}</h2>
              <p className="text-sm text-gray-500">{g.desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-green-500 shrink-0" />
          </Link>
        ))}
      </div>

      <p className="text-sm text-gray-400 mt-6">
        Still stuck? <Link href="/contact" className="text-green-600 hover:underline">Contact us</Link>.
      </p>
    </div>
  )
}
