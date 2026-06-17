import Link from 'next/link'
import { AppLogo } from '@/components/app-logo'
import { Button } from '@/components/ui/button'
import {
  Trophy, Users, Swords, CalendarClock, BarChart3, Shield, ArrowLeft, ArrowRight,
} from 'lucide-react'

export const metadata = {
  title: 'How to Use The Kitchen | Pickleball League App',
  description: 'A quick guide to running your pickleball league with The Kitchen — rankings, matches, tournaments, court booking, and open play.',
}

function Feature({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">{icon}</div>
        <h2 className="font-bold text-gray-900">{title}</h2>
      </div>
      <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold shrink-0">{n}</div>
      <p className="text-sm text-gray-600 leading-relaxed flex-1">{children}</p>
    </div>
  )
}

export default function HowToUsePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50">
      {/* Nav */}
      <nav className="border-b bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <AppLogo className="w-8 h-8" />
            <span className="font-bold text-lg sm:text-xl text-gray-900 whitespace-nowrap">The Kitchen</span>
          </Link>
          <Button size="sm" asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">How to use The Kitchen</h1>
          <p className="text-gray-500 max-w-xl mx-auto leading-relaxed">
            Everything you need to run a pickleball club in one app — fair rankings, matches,
            tournaments, court booking, and live open-play nights. Here&apos;s the quick tour.
          </p>
        </div>

        {/* Getting started */}
        <div className="rounded-2xl border bg-white p-6 mb-8">
          <h2 className="font-bold text-gray-900 mb-4 text-lg">Getting started</h2>
          <div className="space-y-3">
            <Step n={1}><strong className="text-gray-800">Create your free account</strong> — name, email, and a password. Add your gender and date of birth if you want to enter age/gender tournament divisions.</Step>
            <Step n={2}><strong className="text-gray-800">Create a league</strong> (you become its admin) or <strong className="text-gray-800">join one</strong> with a 6-character invite code from your organiser.</Step>
            <Step n={3}><strong className="text-gray-800">Add your players</strong> — share the invite code, then approve join requests and set roles (admin, officiator, player).</Step>
            <Step n={4}><strong className="text-gray-800">Start playing</strong> — log matches, run tournaments, book courts, and watch the leaderboard come alive.</Step>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          <Feature icon={<BarChart3 className="w-5 h-5 text-green-600" />} title="Rankings that update themselves">
            <p>Every match auto-updates a fair <strong className="text-gray-800">ELO rating</strong>, shown on the familiar DUPR-style 2.0–8.0 scale. Singles and doubles are tracked separately, plus your all-time career high.</p>
          </Feature>

          <Feature icon={<Swords className="w-5 h-5 text-green-600" />} title="Matches & challenges">
            <p>Log singles, doubles, or mixed matches. Or <strong className="text-gray-800">challenge any player</strong> directly — an officiator confirms the result so the rating stays trustworthy.</p>
          </Feature>

          <Feature icon={<Trophy className="w-5 h-5 text-green-600" />} title="Tournaments with divisions">
            <p>Run proper events — Open, Mixed, 35+, Beginner, Novice, Junior and more. Brackets are <strong className="text-gray-800">auto-seeded by skill</strong>, single-elimination or round-robin, with a <strong className="text-gray-800">live link spectators can follow</strong> (no login needed).</p>
          </Feature>

          <Feature icon={<CalendarClock className="w-5 h-5 text-green-600" />} title="Court booking">
            <p>An hourly court calendar with conflict-proof scheduling. Members book slots, see a personal <strong className="text-gray-800">&ldquo;My Bookings&rdquo;</strong> page, and cancel a single hour or a whole booking.</p>
          </Feature>

          <Feature icon={<Users className="w-5 h-5 text-green-600" />} title="Open Play nights">
            <p>Run drop-in sessions like a pro: check players in, <strong className="text-gray-800">auto-balance the courts</strong>, and rotate a live queue everyone follows on their phones. In a rated session, games even count toward league ELO.</p>
          </Feature>

          <Feature icon={<Shield className="w-5 h-5 text-green-600" />} title="Built for clubs">
            <p>Admin tools for members and roles, seasons with final standings, announcements, member bans, and transparent &ldquo;how it works&rdquo; guides so your rankings are always fair and clear.</p>
          </Feature>
        </div>

        {/* Install hint */}
        <div className="rounded-2xl border bg-green-50/60 p-6 mb-8 text-center">
          <h2 className="font-bold text-gray-900 mb-1">📲 Use it like an app</h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            The Kitchen runs right in your browser. Tap the <strong>download icon</strong> in the top bar for one-tap
            instructions to add it to your phone&apos;s home screen — works on iPhone and Android.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Button size="lg" asChild>
            <Link href="/signup" className="inline-flex items-center gap-1.5">
              Get started free <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <div className="mt-6">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
