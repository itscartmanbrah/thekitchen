import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Trophy, Info, HelpCircle, GitFork, FastForward } from 'lucide-react'

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

export default function TournamentsGuidePage() {
  return (
    <div className="max-w-2xl">

      {/* ── Header ── */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
            <Trophy className="w-4 h-4 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">How Tournaments Work</h1>
        </div>
        <p className="text-gray-500 text-sm leading-relaxed">
          The Kitchen runs <strong className="text-gray-700">single-elimination tournaments</strong> with
          automatic seeding. This page explains exactly how the bracket is built, why some
          players skip the first round, and how results affect your ELO — no guesswork.
        </p>
      </div>

      {/* ── The big idea ── */}
      <Section title="The big idea" icon={<Info className="w-4 h-4 text-blue-500" />}>
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            In a single-elimination tournament, <strong className="text-gray-800">lose once and you&apos;re out</strong>.
            Winners advance round by round — Quarterfinals, Semifinals, Final — until one
            champion remains.
          </p>
          <p>
            Who plays whom is not random: the bracket is <strong className="text-gray-800">seeded by your league
            ELO at the moment the tournament is created</strong>. The #1 seed is the highest-rated
            entrant, #2 the next, and so on.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
            Seeding rewards your league performance — climb the leaderboard and you earn an
            easier early draw in the next tournament.
          </div>
        </div>
      </Section>

      {/* ── Step by step ── */}
      <Section title="How the bracket is built — step by step" icon={<GitFork className="w-4 h-4 text-green-500" />}>
        <div className="space-y-6">

          <Step number={1} title="Players are seeded by ELO">
            <p>
              When an admin creates the tournament, every entrant is ranked by their current
              league ELO. That ranking is their <strong className="text-gray-800">seed</strong> — the small number
              you see next to each name in the bracket.
            </p>
          </Step>

          <Separator />

          <Step number={2} title="The bracket rounds up to a power of 2">
            <p>
              Brackets only work with 2, 4, 8, 16, 32, or 64 slots. If the number of entrants
              doesn&apos;t fit exactly, the bracket rounds <em>up</em> and the empty slots become{' '}
              <strong className="text-gray-800">byes</strong>.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <ExBox label="12 players" value="16 slots" sub="4 byes" />
              <ExBox label="20 players" value="32 slots" sub="12 byes" />
              <ExBox label="42 players" value="64 slots" sub="22 byes" />
            </div>
          </Step>

          <Separator />

          <Step number={3} title="Top seeds get the byes — that's why some players start in Round 2">
            <p>
              A <strong className="text-gray-800">bye</strong> means &ldquo;no opponent in this round — advance
              automatically.&rdquo; Byes always go to the <strong className="text-gray-800">highest seeds</strong>,
              which is standard practice in every sport from tennis to the NFL playoffs.
            </p>
            <p>
              So when you see the #1 seed already sitting in Round 2 before a single point has
              been played, <strong className="text-gray-800">they haven&apos;t won anything yet</strong> — they
              simply didn&apos;t have a first-round opponent. Their Round 1 card shows
              &ldquo;Bye&rdquo;.
            </p>
          </Step>

          <Separator />

          <Step number={4} title="Matchups follow the classic seeding pattern">
            <p>
              Round 1 pairs the strongest against the weakest: seed 1 plays the lowest seed,
              seed 2 plays the second-lowest, and so on. If everyone wins as expected, the
              #1 and #2 seeds only meet in the Final.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <ExBox label="8-player bracket" value="1v8 · 4v5 · 2v7 · 3v6" sub="Round 1 pairings" />
              <ExBox label="If favourites win" value="1 vs 2" sub="in the Final" />
            </div>
          </Step>

          <Separator />

          <Step number={5} title="Winners advance, results count toward ELO">
            <p>
              When an admin or officiator enters a score, the winner moves into the next round
              automatically. Every tournament game is also recorded as a{' '}
              <strong className="text-gray-800">real league match</strong> — it updates your ELO, win/loss
              record, and form exactly like any other game.{' '}
              <Link href="/elo" className="text-green-600 underline hover:text-green-700">
                See how ELO is calculated
              </Link>.
            </p>
          </Step>

        </div>
      </Section>

      {/* ── Spectators ── */}
      <Section title="Following along as a spectator" icon={<FastForward className="w-4 h-4 text-purple-500" />}>
        <p className="text-sm text-gray-600 leading-relaxed">
          Every tournament has a <strong className="text-gray-800">public share link</strong> (the
          &ldquo;Share with spectators&rdquo; button). Anyone with the link can watch the bracket
          update live — friends, family, club members — no account or login needed. They see
          exactly the same bracket you do, minus the score-entry controls.
        </p>
      </Section>

      {/* ── FAQ ── */}
      <Section title="Common questions" icon={<HelpCircle className="w-4 h-4 text-gray-400" />}>
        <div className="space-y-5">
          <FAQ
            q="Why is a player already in Round 2 before any matches were played?"
            a="They received a bye — the bracket had more slots than players, and the spare first-round slots go to the top seeds. They advance automatically without playing, but they haven't won a match yet."
          />
          <Separator />
          <FAQ
            q="Who decides the seeds?"
            a="Nobody — seeding is fully automatic, taken from each player's league ELO at the moment the tournament is created. Admins can't reorder it, which keeps it fair."
          />
          <Separator />
          <FAQ
            q="Do tournament matches change my ELO?"
            a="Yes. Every tournament game is a real league match — the same ELO maths applies, including the margin-of-victory bonus. A deep tournament run can move your rating significantly."
          />
          <Separator />
          <FAQ
            q="My ELO went up after the bracket was made — does my seed change?"
            a="No. Seeds are locked in when the tournament is created. Your new rating will count for the next tournament."
          />
          <Separator />
          <FAQ
            q="Who can enter scores?"
            a="League admins and officiators. Players can't report their own tournament results — that keeps the bracket trustworthy."
          />
          <Separator />
          <FAQ
            q="What happens if I lose?"
            a="In single elimination, a loss means you're out of the tournament — but the match still counts toward your league ELO and record, win or lose."
          />
        </div>
      </Section>

      <p className="text-xs text-center text-gray-400 pb-8">
        Want to know how the ratings behind seeding work?{' '}
        <Link href="/elo" className="underline hover:text-gray-600">Read the ELO guide.</Link>
      </p>

    </div>
  )
}
