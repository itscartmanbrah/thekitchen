create or replace function accept_challenge(p_challenge_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_challenge      record;
  v_match_id       uuid;
  v_elo_challenger integer;
  v_elo_challenged integer;
begin
  select * into v_challenge from challenges where id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found';
  end if;

  if v_challenge.challenged_id != auth.uid() then
    raise exception 'Not authorised to accept this challenge';
  end if;

  if v_challenge.status != 'pending_player' then
    raise exception 'Challenge is not awaiting player response';
  end if;

  -- Look up current ELO for both players in this league
  select elo_rating into v_elo_challenger
  from league_members
  where league_id = v_challenge.league_id
    and user_id = v_challenge.challenger_id;

  select elo_rating into v_elo_challenged
  from league_members
  where league_id = v_challenge.league_id
    and user_id = v_challenge.challenged_id;

  -- Create the match
  insert into matches (
    league_id, format, status, officiator_id, created_by, scheduled_at, max_points
  ) values (
    v_challenge.league_id, v_challenge.format, 'scheduled',
    v_challenge.officiator_id, v_challenge.challenger_id,
    v_challenge.proposed_at, 11
  )
  returning id into v_match_id;

  -- Add both players with their current ELO snapshot
  insert into match_players (match_id, user_id, team, elo_before) values
    (v_match_id, v_challenge.challenger_id, 1, coalesce(v_elo_challenger, 1000)),
    (v_match_id, v_challenge.challenged_id, 2, coalesce(v_elo_challenged, 1000));

  -- Mark challenge accepted
  update challenges
  set status = 'accepted', match_id = v_match_id
  where id = p_challenge_id;

  return v_match_id;
end;
$$;
