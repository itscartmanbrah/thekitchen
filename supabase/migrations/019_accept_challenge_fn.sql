-- Security definer function so a challenged player (any role) can
-- atomically accept a challenge and create the resulting match,
-- even though they don't have direct INSERT rights on matches/match_players.

create or replace function accept_challenge(p_challenge_id uuid)
returns uuid   -- returns the new match_id
language plpgsql
security definer
as $$
declare
  v_challenge record;
  v_match_id  uuid;
begin
  -- Load the challenge
  select * into v_challenge
  from challenges
  where id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found';
  end if;

  -- Only the challenged player can call this
  if v_challenge.challenged_id != auth.uid() then
    raise exception 'Not authorised to accept this challenge';
  end if;

  -- Must be in the right state
  if v_challenge.status != 'pending_player' then
    raise exception 'Challenge is not awaiting player response';
  end if;

  -- Create the match
  insert into matches (
    league_id,
    format,
    status,
    officiator_id,
    created_by,
    scheduled_at,
    max_points
  ) values (
    v_challenge.league_id,
    v_challenge.format,
    'scheduled',
    v_challenge.officiator_id,
    v_challenge.challenger_id,
    v_challenge.proposed_at,
    11
  )
  returning id into v_match_id;

  -- Add both players
  insert into match_players (match_id, user_id, team) values
    (v_match_id, v_challenge.challenger_id, 1),
    (v_match_id, v_challenge.challenged_id, 2);

  -- Mark challenge as accepted
  update challenges
  set status   = 'accepted',
      match_id = v_match_id
  where id = p_challenge_id;

  return v_match_id;
end;
$$;
