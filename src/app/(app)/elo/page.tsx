import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getPickleballRating } from '@/lib/utils'
import { TrendingUp, Info, HelpCircle } from 'lucide-react'

// ─── tiny helpers ────────────────────────────────────────────────────────────

function Section({ title, icon, children }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="mb-5">
      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-base flex items-center gap-2 font-semibold text-gray-900">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-5">{children}</CardContent>
    </Card>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold mt-0.5">
        {number}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm text-gray-900 mb-1">{title}</p>
        <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
      </div>
    </div>
  )
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-950 text-green-400 rounded-lg px-4 py-3 font-mono text-xs leading-relaxed overflow-x-auto my-2">
      {children}
    </div>
  )
}

function ExBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 border rounded-lg px-3 py-2 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="font-mono font-semibold text-sm text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="font-semibold text-sm text-gray-900 mb-1">{q}</p>
      <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
    </div>
  )
}

// ─── pickleball rating table data ────────────────────────────────────────────

const PB_LEVELS = [
  { elo: '1500+', rating: '5.0+', label: 'Elite / Pro',       desc: 'Competes at the highest amateur or professional level',         eloRange: '1,500 +' },
  { elo: '1350',  rating: '4.5',  label: 'Tournament Player', desc: 'Consistently wins at local tournaments, strong all-round game', eloRange: '1,350 – 1,499' },
  { elo: '1200',  rating: '4.0',  label: 'Advanced',          desc: 'Power, spin, and solid strategy on every shot',                eloRange: '1,200 – 1,349' },
  { elo: '1100',  rating: '3.5',  label: 'Intermediate+',     desc: 'More consistent, developing tactics and court awareness',       eloRange: '1,100 – 1,199' },
  { elo: '1000',  rating: '3.0',  label: 'Intermediate',      desc: 'Reliable groundstrokes, understands positioning',              eloRange: '1,000 – 1,099' },
  { elo: '950',   rating: '2.5',  label: 'Beginner+',         desc: 'Can sustain rallies, learning the kitchen rules',               eloRange: '950 – 999' },
  { elo: '900',   rating: '2.0',  label: 'Beginner',          desc: 'Basic shots, still learning scoring and positioning',           eloRange: '900 – 949' },
  { elo: '0',     rating: '1.5',  label: 'New Player',        desc: 'Just getting started',                                          eloRange: 'Below 900' },
]

// ─── page ─────────────────────────────────────────────────────────────────────

export default function EloPage() {
  return (
    <div className="max-w-2xl">

      {/* ── Header ── */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">How Rankings Work</h1>
        </div>
        <p className="text-gray-500 text-sm leading-relaxed">
          The Kitchen uses a points system called <strong className="text-gray-700">ELO</strong> to rank
          players fairly. This page explains exactly how every number is calculated — no guesswork.
        </p>
      </div>

      {/* ── The big idea ── */}
      <Section title="The big idea" icon={<Info className="w-4 h-4 text-blue-500" />}>
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            Every player starts at <strong className="text-gray-800">1,000 points</strong> when they
            join a league. After each match, a small number of points move from the loser to the winner.
          </p>
          <p>
            The clever part: <strong className="text-gray-800">the amount of points that move depends on how surprising the result was.</strong>{' '}
            If you beat someone way better than you, you gain a lot. If you beat someone
            much weaker, you gain almost nothing — the system expected you to win.
          </p>
          <p>
            On top of that, <strong className="text-gray-800">winning by a bigger margin earns more points</strong> than
            scraping through. A 11–0 blowout moves more than an 11–9 squeaker.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-xs text-green-800">
            Rankings are <strong>per league</strong> — your points in one league have no effect on another league.
          </div>
        </div>
      </Section>

      {/* ── Step by step ── */}
      <Section title="How a match is calculated — step by step" icon={<TrendingUp className="w-4 h-4 text-green-500" />}>
        <div className="space-y-6">

          <Step number={1} title="Before the match: work out who is expected to win">
            <p>
              We look at both players&apos; current points and calculate the probability that each one wins.
              The bigger the gap between players, the more lopsided those probabilities are.
            </p>
            <CodeBlock>
              Expected score for Player A ={'\n'}
              {'  '}1 ÷ (1 + 10 ^ ((Player B points − Player A points) ÷ 400))
            </CodeBlock>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <ExBox label="Both at 1,000 pts" value="50% vs 50%" sub="Coin flip — equal players" />
              <ExBox label="1,200 vs 800 pts" value="91% vs 9%" sub="Strong favourite" />
            </div>
          </Step>

          <Separator />

          <Step number={2} title="After the match: see how dominant the win was">
            <p>
              We look at the final score gap and calculate a <strong className="text-gray-800">margin multiplier</strong>.
              This is a number between <strong className="text-gray-800">1.0× and 1.5×</strong> that
              scales the points transfer up for bigger wins.
            </p>
            <CodeBlock>
              Margin multiplier = 1 + (score gap ÷ max points) × 0.5{'\n'}
              (always between 1.0 and 1.5)
            </CodeBlock>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <ExBox label="Close (11–9)" value="1.09×" sub="diff = 2" />
              <ExBox label="Comfortable (11–5)" value="1.27×" sub="diff = 6" />
              <ExBox label="Blowout (11–0)" value="1.50×" sub="max" />
            </div>
          </Step>

          <Separator />

          <Step number={3} title="Calculate the points to transfer">
            <p>
              Combine the expected score, the actual result (win = 1, loss = 0), and the margin
              multiplier with a sensitivity constant called <strong className="text-gray-800">K (= 32)</strong>.
              Higher K means bigger swings per match.
            </p>
            <CodeBlock>
              Points change = 32 × multiplier × (actual result − expected score)
            </CodeBlock>
            <p>
              The winner and loser always swap the same amount — the system is zero-sum.
            </p>
          </Step>

          <Separator />

          <Step number={4} title="Doubles & Mixed Doubles">
            <p>
              For team formats, each <strong className="text-gray-800">team&apos;s average points</strong> are
              used to calculate the expected score. The same points change is then applied to every
              individual on the team.
            </p>
            <CodeBlock>
              Team score = average of all players on that team{'\n'}
              Every player on winning team: + same delta{'\n'}
              Every player on losing team:  − same delta
            </CodeBlock>
          </Step>

          {/* Full worked example */}
          <div className="bg-gray-50 rounded-xl p-4 border">
            <p className="font-semibold text-sm text-gray-900 mb-3">Full worked example — 11–5 win, both players at 1,000</p>
            <div className="space-y-1.5 text-xs font-mono text-gray-700">
              <p><span className="text-gray-400">Step 1 —</span> Expected score = 1 ÷ (1 + 10^0) = <strong>0.50 (50%)</strong></p>
              <p><span className="text-gray-400">Step 2 —</span> Multiplier = 1 + (6 ÷ 11) × 0.5 = <strong>1.27×</strong></p>
              <p><span className="text-gray-400">Step 3 —</span> Points change = 32 × 1.27 × (1.0 − 0.50) = <strong>≈ +20 pts</strong></p>
              <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-2 gap-2">
                <div className="bg-green-100 rounded px-3 py-2 text-center">
                  <p className="text-green-700 font-semibold">Winner</p>
                  <p className="text-green-800">1,000 → <strong>1,020</strong></p>
                </div>
                <div className="bg-red-50 rounded px-3 py-2 text-center">
                  <p className="text-red-600 font-semibold">Loser</p>
                  <p className="text-red-700">1,000 → <strong>980</strong></p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </Section>

      {/* ── Pickleball rating ── */}
      <Section title="Pickleball skill rating (1.5 – 5.0+)" icon={<span className="text-base">🏓</span>}>
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed mb-4">
          <p>
            Alongside your ELO points, The Kitchen shows a <strong className="text-gray-800">standard pickleball skill rating</strong> —
            the same 1.5 to 5.0+ scale used by USA Pickleball. This gives you a familiar,
            real-world label for where your game is at.
          </p>
          <p>
            Your skill rating is <strong className="text-gray-800">calculated automatically from your ELO points</strong> using
            the table below. As your points go up, your rating goes up — no self-assessment needed.
          </p>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[56px_56px_1fr] text-xs font-semibold text-gray-500 bg-gray-50 px-4 py-2 border-b">
            <span>Rating</span>
            <span>ELO</span>
            <span>What it means</span>
          </div>
          {PB_LEVELS.map((row) => {
            const pb = getPickleballRating(parseInt(row.elo))
            return (
              <div
                key={row.rating}
                className="grid grid-cols-[56px_56px_1fr] items-start px-4 py-3 border-b last:border-b-0 gap-x-2"
              >
                <span className={`font-bold text-sm ${pb.color}`}>{row.rating}</span>
                <span className="text-xs text-gray-400 pt-0.5">{row.eloRange.split('–')[0].trim()}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{row.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{row.desc}</p>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          * This is an approximation based on league performance. Official USA Pickleball ratings
          require a certified assessment.
        </p>
      </Section>

      {/* ── FAQ ── */}
      <Section title="Common questions" icon={<HelpCircle className="w-4 h-4 text-gray-400" />}>
        <div className="space-y-5">
          <FAQ
            q="Why did I barely gain any points after winning?"
            a="You were the favourite. When the expected person wins, only a small amount moves. To gain big points, beat someone rated higher than you or win by a wide margin."
          />
          <Separator />
          <FAQ
            q="Why did I lose so many points after losing?"
            a="The system expected you to win. Losing to a lower-rated player is a strong negative signal — that's ELO working as designed."
          />
          <Separator />
          <FAQ
            q="Can my points go below 1,000?"
            a="Yes — 1,000 is just the starting point, not a floor. The only hard floor is 100 points."
          />
          <Separator />
          <FAQ
            q="Can my pickleball rating go down?"
            a="Yes. It's tied directly to your ELO points. Lose enough matches and your rating drops a level."
          />
          <Separator />
          <FAQ
            q="Do my points carry over to other leagues?"
            a="No. Every league is completely independent. You start at 1,000 in each new league you join."
          />
          <Separator />
          <FAQ
            q="What is the K factor?"
            a="K = 32 is the sensitivity dial. It controls the maximum points that can change in a single match. 32 is the standard value for local amateur play."
          />
        </div>
      </Section>

      <p className="text-xs text-center text-gray-400 pb-8">
        Questions about your rating?{' '}
        <Link href="/dashboard" className="underline hover:text-gray-600">Go back to your leagues.</Link>
      </p>

    </div>
  )
}
