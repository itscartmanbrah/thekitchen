'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Info } from 'lucide-react'

// One source of truth for what each Open Play style is and how it works.
export interface StyleInfo { label: string; tagline: string; how: string[] }

export const PLAY_STYLE_INFO: Record<string, StyleInfo> = {
  balanced: {
    label: 'Drop-in',
    tagline: 'Casual queue — play, rest, repeat',
    how: [
      'Players wait on the bench; you send groups of 4 onto the courts.',
      'When a game ends, those players rejoin the bench and the longest-waiting go on next.',
      'People can arrive or leave anytime — there are no fixed rounds.',
    ],
  },
  king: {
    label: 'King of the Court',
    tagline: 'Winners play winners, losers play losers',
    how: [
      'Every round everyone plays; winning moves you toward the top “Kings” game.',
      'Players are ranked by their win record and grouped with others at their level.',
      'If more people than courts can hold, the most-played sit out a round so court time stays even.',
    ],
  },
  americano: {
    label: 'Americano',
    tagline: 'Social mixer — everyone with everyone',
    how: [
      'Every round you get a new partner and new opponents.',
      'You score points each game and are ranked individually by total points.',
      'Partners keep changing all session — great for meeting people.',
    ],
  },
  mexicano: {
    label: 'Mexicano',
    tagline: 'Social, but competitive',
    how: [
      'Each round re-pairs by the live leaderboard, so the closest-ranked players meet.',
      'You score points each game and are ranked individually by total points.',
      'Starts mixed and gets tighter — the leaders end up battling each other.',
    ],
  },
  skill: {
    label: 'Skill-separated',
    tagline: 'Competitive games — levels stay close',
    how: [
      'Give each player a level (1–5) when they check in.',
      'Games only pair players within ~2 levels of each other — no lopsided blowouts.',
      'If a close match can’t be formed yet, those players wait rather than get a wide-gap game.',
    ],
  },
  mixed: {
    label: 'Mixed Doubles',
    tagline: 'Every game is 2 men + 2 women',
    how: [
      'Tag each player as M or F when they check in.',
      'Each game puts two men and two women on court, one of each per team.',
      'Great for mixed social nights and mixed events.',
    ],
  },
  skill_courts: {
    label: 'Skill Courts',
    tagline: 'Each court is its own level tier',
    how: [
      'Give each player a level (1–5) when they check in.',
      'Court 1 is the strongest tier, the last court the most casual — each court has its own queue.',
      'When a court frees, it pulls the next game from its own tier, so players stay on courts that match their level.',
    ],
  },
}

const ALIAS: Record<string, string> = { ladder: 'king' }
export function styleInfo(mode: string): StyleInfo {
  return PLAY_STYLE_INFO[ALIAS[mode] ?? mode] ?? PLAY_STYLE_INFO.balanced
}

const ONE_COURT_NOTE =
  'On a single court the round’s games play one at a time — send a game, enter its score, then send the next; generate the next round once all are scored.'

// Full explanation block for the SELECTED style (used on the create forms).
export function StyleExplainer({ mode, courtCount }: { mode: string; courtCount?: number }) {
  const i = styleInfo(mode)
  return (
    <div className="text-[11px] text-muted-foreground bg-muted/40 border rounded-lg px-3 py-2 space-y-1.5">
      <p className="font-semibold text-foreground">{i.label} — <span className="font-normal text-muted-foreground">{i.tagline}</span></p>
      <ul className="space-y-0.5">
        {i.how.map((h, idx) => <li key={idx} className="flex gap-1.5"><span className="text-violet-500">•</span><span>{h}</span></li>)}
      </ul>
      {courtCount === 1 && mode !== 'balanced' && (
        <p className="text-muted-foreground pt-0.5"><strong>On one court:</strong> {ONE_COURT_NOTE.replace('On a single court the', 'the')}</p>
      )}
    </div>
  )
}

// Clickable badge that shows what the CURRENT style is, with a tap-for-details
// dialog (used in the running session header). Works for every mode.
export function StyleBadge({ mode, courtCount }: { mode: string; courtCount?: number }) {
  const [open, setOpen] = useState(false)
  const i = styleInfo(mode)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 transition rounded-full px-2 py-0.5 uppercase">
        {i.label}<Info className="w-3 h-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{i.label}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">{i.tagline}</p>
          <ul className="space-y-2 mt-1">
            {i.how.map((h, idx) => <li key={idx} className="flex gap-2 text-sm text-foreground/90"><span className="text-violet-500 mt-0.5">•</span><span>{h}</span></li>)}
          </ul>
          {courtCount === 1 && mode !== 'balanced' && (
            <div className="text-xs text-muted-foreground bg-muted/40 border rounded-lg p-3 mt-1">{ONE_COURT_NOTE}</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
