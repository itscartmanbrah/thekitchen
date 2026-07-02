import Link from 'next/link'
import { AppLogo } from '@/components/app-logo'
import { InstallAppButton } from '@/components/install-app-button'
import { ModeToggle } from '@/components/mode-toggle'
import { LandingHero } from '@/components/landing-hero'
import { LandingOpenPlay } from '@/components/landing-openplay'
import { ResumeSessionBanner } from '@/components/resume-session-banner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FadeIn, FadeInStagger, FadeInItem } from '@/components/ui/fade-in'
import { Trophy, Users, Zap, BarChart3, Shield, Star } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <AppLogo className="w-8 h-8" />
            <span className="font-bold text-lg sm:text-xl text-foreground whitespace-nowrap">The Kitchen</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <ModeToggle />
            <InstallAppButton />
            <Button variant="ghost" asChild className="font-semibold hidden sm:inline-flex">
              <Link href="/play/new">Open Play</Link>
            </Button>
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/how-to-use">How to use</Link>
            </Button>
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/contact">Contact</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="px-2 sm:px-4">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Get started free</span>
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <ResumeSessionBanner />

      {/* Open Play — the flagship, front and center */}
      <LandingOpenPlay />

      {/* Hero — leagues & ELO */}
      <LandingHero />

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <FadeIn>
        <h2 className="text-3xl font-bold text-center text-foreground mb-4">How it works</h2>
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
          Three steps from signup to leaderboard.
        </p>
        </FadeIn>
        <FadeInStagger className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: '1',
              icon: <Shield className="w-6 h-6 text-primary" />,
              title: 'Create your league',
              desc: "Set a name, location, and banner color. You're automatically the Head Admin with full control.",
            },
            {
              step: '2',
              icon: <Users className="w-6 h-6 text-primary" />,
              title: 'Invite players',
              desc: 'Share your unique 6-character invite code. Players join instantly and start at 1000 ELO.',
            },
            {
              step: '3',
              icon: <Trophy className="w-6 h-6 text-primary" />,
              title: 'Log matches & rank up',
              desc: 'Admins create matches, officiators confirm scores, and ELO updates automatically.',
            },
          ].map(item => (
            <FadeInItem key={item.step}>
            <Card className="relative overflow-hidden h-full transition-shadow hover:shadow-md">
              <CardContent className="pt-6">
                <div className="absolute top-4 right-4 text-6xl font-bold text-muted select-none">{item.step}</div>
                <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-4">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-lg text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </CardContent>
            </Card>
            </FadeInItem>
          ))}
        </FadeInStagger>
      </section>

      {/* Features */}
      <section className="bg-muted/40 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <FadeIn><h2 className="text-3xl font-bold text-center text-foreground mb-12">Everything your league needs</h2></FadeIn>
          <FadeInStagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <BarChart3 className="w-5 h-5" />, title: 'ELO Rankings', desc: 'Margin-aware ELO with a score multiplier so blowouts move more points than squeakers.' },
              { icon: <Users className="w-5 h-5" />, title: 'Multiple Roles', desc: 'Head Admin, Admin, Officiator, and Player — each with the right level of access.' },
              { icon: <Trophy className="w-5 h-5" />, title: 'Match Formats', desc: 'Singles, Doubles, Mixed Doubles, and Round Robin tournaments all supported.' },
              { icon: <Zap className="w-5 h-5" />, title: 'Instant Updates', desc: 'Real-time leaderboard updates the moment a match is confirmed.' },
              { icon: <Star className="w-5 h-5" />, title: 'Multi-League', desc: 'Players can join multiple leagues with separate rankings in each.' },
              { icon: <Shield className="w-5 h-5" />, title: 'Invite Codes', desc: 'Simple 6-character codes make it easy to bring the whole crew in.' },
            ].map(f => (
              <FadeInItem key={f.title} className="flex gap-4 p-4">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center shrink-0 text-primary">
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </div>
              </FadeInItem>
            ))}
          </FadeInStagger>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 py-24 text-center">
        <FadeIn>
        <h2 className="text-4xl font-bold text-foreground mb-4">Ready to dominate the kitchen?</h2>
        <p className="text-muted-foreground mb-8 text-lg">Create your free league in under a minute.</p>
        <Button size="lg" asChild className="text-base px-10">
          <Link href="/signup">Create your league →</Link>
        </Button>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <AppLogo className="w-5 h-5" />
          <span className="font-semibold text-foreground/90">The Kitchen</span>
        </div>
        <p className="font-medium text-foreground/90">© {new Date().getFullYear()} The Kitchen. All rights reserved.</p>
        <p className="mt-1 text-xs">Developed and owned by Clyde Villaruz. Unauthorised use or reproduction is prohibited.</p>
        <div className="mt-2">
          <Link href="/contact" className="text-primary hover:underline text-sm">Contact us</Link>
        </div>
      </footer>
    </div>
  )
}
