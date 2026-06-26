-- "Keep courts busy": when a court frees, the next game is auto-staged On Deck
-- so the organizer can review/swap, then send with one tap — instead of waiting
-- for every court to finish before the next round can be built.
--
-- auto_stage is a per-session preference (default on). Organizers can switch it
-- off to run strict round-by-round.

alter table play_sessions add column if not exists auto_stage boolean not null default true;

create or replace function set_session_auto_stage(p_session_id uuid, p_auto boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not can_manage_session(p_session_id) then raise exception 'Not authorised'; end if;
  update play_sessions set auto_stage = p_auto where id = p_session_id;
end;
$$;
grant execute on function set_session_auto_stage(uuid, boolean) to authenticated;

-- Swap two players who are each already in a (different) on-deck group. Both
-- stay 'staged', so this skips the "must be queued" availability check that
-- set_session_group enforces for newly-added players.
create or replace function swap_staged_players(p_game_a uuid, p_a uuid, p_game_b uuid, p_b uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_ga session_games%rowtype; v_gb session_games%rowtype;
begin
  select * into v_ga from session_games where id = p_game_a;
  if not found then raise exception 'Group not found'; end if;
  select * into v_gb from session_games where id = p_game_b;
  if not found then raise exception 'Group not found'; end if;
  if v_ga.status <> 'staged' or v_gb.status <> 'staged' then raise exception 'Both groups must be on deck'; end if;
  if v_ga.session_id <> v_gb.session_id then raise exception 'Groups are in different sessions'; end if;
  if not can_manage_session(v_ga.session_id) then raise exception 'Not authorised'; end if;
  if not (p_a = any(v_ga.team1_ids) or p_a = any(v_ga.team2_ids)) then raise exception 'Player not in first group'; end if;
  if not (p_b = any(v_gb.team1_ids) or p_b = any(v_gb.team2_ids)) then raise exception 'Player not in second group'; end if;

  update session_games set team1_ids = array_replace(team1_ids, p_a, p_b),
                           team2_ids = array_replace(team2_ids, p_a, p_b) where id = p_game_a;
  update session_games set team1_ids = array_replace(team1_ids, p_b, p_a),
                           team2_ids = array_replace(team2_ids, p_b, p_a) where id = p_game_b;
end;
$$;
grant execute on function swap_staged_players(uuid, uuid, uuid, uuid) to authenticated;
