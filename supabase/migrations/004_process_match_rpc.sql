-- Server-side ELO processing function.
-- Runs as security definer (postgres role) so it bypasses RLS, meaning
-- any authenticated user who can update the match (admin or officiator)
-- can trigger ELO updates for all players regardless of their own role.

create or replace function process_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match        matches%rowtype;
  v_team1_avg    float;
  v_team2_avg    float;
  v_e1           float;
  v_s1           float;
  v_margin_mult  float;
  v_delta1       int;
  v_delta2       int;
  v_player       record;
  v_delta        int;
  v_won          boolean;
  v_new_elo      int;
begin
  select * into v_match from matches where id = p_match_id;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  if v_match.status != 'completed' then
    raise exception 'Match is not completed';
  end if;

  if v_match.team1_score is null or v_match.team2_score is null then
    raise exception 'Scores are missing';
  end if;

  -- Team average ELOs
  select avg(elo_before) into v_team1_avg
    from match_players where match_id = p_match_id and team = 1;
  select avg(elo_before) into v_team2_avg
    from match_players where match_id = p_match_id and team = 2;

  -- Expected scores
  v_e1 := 1.0 / (1.0 + power(10.0, (v_team2_avg - v_team1_avg) / 400.0));

  -- Actual scores
  v_s1 := case when v_match.team1_score > v_match.team2_score then 1.0 else 0.0 end;

  -- Margin multiplier clamped to [1.0, 1.5]
  v_margin_mult := 1.0 + (
    abs(v_match.team1_score - v_match.team2_score)::float
    / nullif(v_match.max_points, 0)::float
  ) * 0.5;
  v_margin_mult := least(1.5, greatest(1.0, v_margin_mult));

  -- ELO deltas (K=32)
  v_delta1 := round(32.0 * v_margin_mult * (v_s1        - v_e1));
  v_delta2 := round(32.0 * v_margin_mult * ((1.0 - v_s1) - (1.0 - v_e1)));

  -- Apply to every player
  for v_player in
    select * from match_players where match_id = p_match_id
  loop
    if v_player.team = 1 then
      v_delta := v_delta1;
      v_won   := v_match.team1_score > v_match.team2_score;
    else
      v_delta := v_delta2;
      v_won   := v_match.team2_score > v_match.team1_score;
    end if;

    v_new_elo := greatest(100, v_player.elo_before + v_delta);

    -- Update match_players snapshot
    update match_players
       set elo_after = v_new_elo
     where id = v_player.id;

    -- Update standing in league
    update league_members
       set elo_rating = v_new_elo,
           wins       = wins   + case when v_won     then 1 else 0 end,
           losses     = losses + case when not v_won  then 1 else 0 end
     where league_id = v_match.league_id
       and user_id   = v_player.user_id;

    -- Audit trail
    insert into point_transactions
      (match_id, user_id, league_id, points_before, points_after, delta)
    values
      (p_match_id, v_player.user_id, v_match.league_id,
       v_player.elo_before, v_new_elo, v_delta);
  end loop;
end;
$$;

-- Allow any authenticated user to call the function;
-- the USING policies on matches already gate who can mark a match completed.
grant execute on function process_match_result(uuid) to authenticated;
