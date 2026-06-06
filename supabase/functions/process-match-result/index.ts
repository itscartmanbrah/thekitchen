import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload = await req.json()
    const matchId: string = payload.match_id ?? payload.record?.id

    if (!matchId) {
      return new Response(JSON.stringify({ error: 'match_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single()

    if (matchError || !match) {
      return new Response(JSON.stringify({ error: 'Match not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (match.status !== 'completed') {
      return new Response(JSON.stringify({ message: 'Match not completed yet' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (match.team1_score === null || match.team2_score === null) {
      return new Response(JSON.stringify({ error: 'Scores missing' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: players, error: playersError } = await supabase
      .from('match_players')
      .select('*')
      .eq('match_id', matchId)

    if (playersError || !players) {
      return new Response(JSON.stringify({ error: 'Players not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const team1 = players.filter(p => p.team === 1)
    const team2 = players.filter(p => p.team === 2)

    const avgElo = (ps: typeof players) =>
      ps.reduce((sum, p) => sum + p.elo_before, 0) / ps.length

    const avgElo1 = avgElo(team1)
    const avgElo2 = avgElo(team2)

    const s1 = match.team1_score
    const s2 = match.team2_score
    const K = 32
    const maxPts = match.max_points ?? 11
    const pointDiff = Math.abs(s1 - s2)
    const rawMult = 1 + (pointDiff / maxPts) * 0.5
    const marginMult = Math.min(1.5, Math.max(1.0, rawMult))

    const E1 = 1 / (1 + Math.pow(10, (avgElo2 - avgElo1) / 400))
    const E2 = 1 - E1
    const S1 = s1 > s2 ? 1.0 : 0.0
    const S2 = 1.0 - S1

    const delta1 = Math.round(K * marginMult * (S1 - E1))
    const delta2 = Math.round(K * marginMult * (S2 - E2))

    const updates = [
      ...team1.map(p => ({ player: p, delta: delta1, won: s1 > s2 })),
      ...team2.map(p => ({ player: p, delta: delta2, won: s2 > s1 })),
    ]

    for (const { player, delta, won } of updates) {
      const newElo = Math.max(100, player.elo_before + delta)

      await supabase.from('match_players')
        .update({ elo_after: newElo })
        .eq('id', player.id)

      const { data: member } = await supabase
        .from('league_members')
        .select('wins, losses')
        .eq('league_id', match.league_id)
        .eq('user_id', player.user_id)
        .single()

      if (member) {
        await supabase.from('league_members').update({
          elo_rating: newElo,
          wins: won ? member.wins + 1 : member.wins,
          losses: !won ? member.losses + 1 : member.losses,
        })
          .eq('league_id', match.league_id)
          .eq('user_id', player.user_id)
      }

      await supabase.from('point_transactions').insert({
        match_id: match.id,
        user_id: player.user_id,
        league_id: match.league_id,
        points_before: player.elo_before,
        points_after: newElo,
        delta,
      })
    }

    return new Response(JSON.stringify({ success: true, processed: updates.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
