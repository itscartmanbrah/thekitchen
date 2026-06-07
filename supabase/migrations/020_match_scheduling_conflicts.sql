-- Scheduling-conflict safeguard
--
-- Rule:
--  - A player who is already in an active (scheduled/in_progress) match that has
--    NO scheduled_at time cannot be added to another active match (we have no way
--    to know when that match will happen, so any new match could collide).
--  - A player who is already in an active match WITH a scheduled_at time can be
--    added to another active match only if the two scheduled times are at least
--    30 minutes apart. If the new match has no proposed time, it's treated as an
--    unknown/unbounded slot and blocked too (can't prove there's no overlap).

-- 1) Trigger: enforce the rule at the database level for every insert into
--    match_players, regardless of which code path creates the match
--    (manual creation, accept_challenge RPC, rematches, etc).
create or replace function check_match_player_conflict()
returns trigger
language plpgsql
security definer
as $$
declare
  v_league_id    uuid;
  v_scheduled_at timestamptz;
  v_status       text;
  v_conflict     boolean;
begin
  select league_id, scheduled_at, status
    into v_league_id, v_scheduled_at, v_status
  from matches
  where id = new.match_id;

  -- Only guard against conflicts for matches that are still "live"
  if v_status not in ('scheduled', 'in_progress') then
    return new;
  end if;

  select exists (
    select 1
    from match_players mp
    join matches m on m.id = mp.match_id
    where mp.user_id = new.user_id
      and mp.match_id <> new.match_id
      and m.league_id = v_league_id
      and m.status in ('scheduled', 'in_progress')
      and (
        v_scheduled_at is null
        or m.scheduled_at is null
        or abs(extract(epoch from (m.scheduled_at - v_scheduled_at))) < 1800
      )
  ) into v_conflict;

  if v_conflict then
    raise exception 'This player already has a conflicting scheduled match (must be at least 30 minutes apart, and matches without a set time block any other match)';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_match_player_conflict on match_players;
create trigger trg_check_match_player_conflict
  before insert on match_players
  for each row execute function check_match_player_conflict();

-- 2) Helper RPC the client can call ahead of time to show a friendly warning /
--    filter out unavailable players, instead of just surfacing a raw DB error.
create or replace function get_conflicting_players(
  p_league_id    uuid,
  p_user_ids     uuid[],
  p_proposed_at  timestamptz
) returns table(user_id uuid)
language sql
security definer
stable
as $$
  select distinct mp.user_id
  from match_players mp
  join matches m on m.id = mp.match_id
  where mp.user_id = any(p_user_ids)
    and m.league_id = p_league_id
    and m.status in ('scheduled', 'in_progress')
    and (
      p_proposed_at is null
      or m.scheduled_at is null
      or abs(extract(epoch from (m.scheduled_at - p_proposed_at))) < 1800
    )
$$;
