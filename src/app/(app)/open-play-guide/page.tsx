import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Users, Info, HelpCircle, Smartphone, ListOrdered } from 'lucide-react'

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="mb-5">
      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-base flex items-center gap-2 font-semibold text-gray-900">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-5">{children}</CardContent>
    </Card>
  )
}
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold mt-0.5">{number}</div>
      <div className="flex-1">
        <p className="font-semibold text-sm text-gray-900 mb-1">{title}</p>
        <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
      </div>
    </div>
  )
}
function FAQ({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-sm text-gray-900 mb-1">{q}</p>
      <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
    </div>
  )
}

export default function OpenPlayGuidePage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">How Open Play Works</h1>
        </div>
        <p className="text-gray-500 text-sm leading-relaxed">
          Open Play turns a busy drop-in night into a smooth, self-running session — check players in,
          auto-balance the courts, and let everyone follow the queue on their phones. And unlike other
          tools, the games can count toward your real league rating.
        </p>
      </div>

      <Section title="The big idea" icon={<Info className="w-4 h-4 text-blue-500" />}>
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>An organiser starts a session, players check in, and The Kitchen builds <strong className="text-gray-800">balanced courts</strong> from a first-come, first-served queue. After each game, the players rotate to the back of the queue and the next group comes on.</p>
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-xs text-green-800">
            In a <strong>Rated</strong> session, games between league members update their ELO — so open play actually moves your ranking. Casual sessions and any game involving a guest are just for fun.
          </div>
        </div>
      </Section>

      <Section title="For organisers — running a session" icon={<ListOrdered className="w-4 h-4 text-green-500" />}>
        <div className="space-y-6">
          <Step number={1} title="Start a session">
            <p>On the <strong className="text-gray-800">Open Play</strong> tab, name the session, set how many courts you have (1–15), pick Singles or Doubles, and choose whether it&apos;s <strong className="text-gray-800">Rated</strong> (counts toward ELO) or casual.</p>
          </Step>
          <Separator />
          <Step number={2} title="Check players in">
            <p>Add <strong className="text-gray-800">league members</strong> by name, or add <strong className="text-gray-800">guests</strong> who aren&apos;t in the league. Everyone joins the queue in the order they check in.</p>
          </Step>
          <Separator />
          <Step number={3} title="Fill the courts">
            <p>Tap <strong className="text-gray-800">Fill open courts</strong>. The Kitchen pulls the next players from the queue and splits each court into the two fairest teams by rating.</p>
          </Step>
          <Separator />
          <Step number={4} title="Record the winner">
            <p>When a game finishes, tap the <strong className="text-gray-800">winning team</strong> on that court. Both teams return to the back of the queue, and the court is ready for the next group.</p>
          </Step>
          <Separator />
          <Step number={5} title="Handle real life">
            <p>Players can <strong className="text-gray-800">rest</strong> (and rejoin later), and you can add latecomers any time — they go to the back of the queue.</p>
          </Step>
          <Separator />
          <Step number={6} title="End the session">
            <p>Tap <strong className="text-gray-800">End</strong> when you&apos;re done. Wins, losses and games played are saved for everyone.</p>
          </Step>
        </div>
      </Section>

      <Section title="For players — joining in" icon={<Smartphone className="w-4 h-4 text-purple-500" />}>
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>Just give your name to the organiser to check in — no account needed for guests.</p>
          <p>Want to follow along from your seat? Ask for the <strong className="text-gray-800">session link</strong> (the organiser&apos;s Share button). Open it on your phone to see who&apos;s on each court and your spot in the queue — it refreshes automatically. No crowding around the front desk.</p>
        </div>
      </Section>

      <Section title="How Open Play affects your rating" icon={<span className="text-base">📈</span>}>
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>A game updates league ELO only when <strong className="text-gray-800">both conditions</strong> are met:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The session is marked <strong className="text-gray-800">Rated</strong>, and</li>
            <li><strong className="text-gray-800">Every player</strong> in that game is a league member (no guests)</li>
          </ul>
          <p>Open-play games count as a standard win for rating purposes (there&apos;s no point score to enter). Curious how the maths works?{' '}
            <Link href="/elo" className="text-green-600 underline hover:text-green-700">See How ELO Works</Link>.
          </p>
        </div>
      </Section>

      <Section title="Common questions" icon={<HelpCircle className="w-4 h-4 text-gray-400" />}>
        <div className="space-y-5">
          <FAQ q="Can non-members play?" a="Yes — add them as guests. They appear in the queue and on the courts, but their games never affect anyone's ELO." />
          <Separator />
          <FAQ q="Why didn't my open-play game change my rating?" a="Either the session was casual (not Rated), or a guest was in the game. ELO only moves in a Rated session where all players are members." />
          <Separator />
          <FAQ q="Do I need an account to follow along?" a="No. The session share link is public — open it in any browser to watch the courts and queue live." />
          <Separator />
          <FAQ q="What's the difference between Open Play and booking a court?" a="Booking reserves a specific court at a specific time. Open Play runs a live drop-in night: a shared queue rotating players across all the courts." />
          <Separator />
          <FAQ q="Who can run a session?" a="League admins and officiators. Players join in and (in a Rated session) earn ELO." />
        </div>
      </Section>

      <p className="text-xs text-center text-gray-400 pb-8">
        Back to <Link href="/dashboard" className="underline hover:text-gray-600">your leagues</Link>.
      </p>
    </div>
  )
}
