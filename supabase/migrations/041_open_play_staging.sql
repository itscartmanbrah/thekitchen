-- Open Play flagship: "On Deck" staging area + per-court timers + fair rotation.
--   * session_games can be 'staged' (built on deck, no court yet) then assigned.
--   * games can be 'locked' so Auto Fill won't reshuffle them.
--   * session_players track queued_since (wait timer + fairness) and a 'staged'
--     status while sitting in an on-deck group.

alter table session_games alter column court_number drop not null;
alter table session_games drop constraint if exists session_games_status_check;
alter table session_games add constraint session_games_status_check
  check (status in ('staged', 'in_progress', 'completed'));
alter table session_games add column if not exists locked boolean not null default false;

alter table session_players add column if not exists queued_since timestamptz not null default now();
alter table session_players drop constraint if exists session_players_status_check;
alter table session_players add constraint session_players_status_check
  check (status in ('queued', 'playing', 'resting', 'left', 'staged'));

-- ── stage a group (on deck, optionally empty) ───────────────────────────────
create or replace function stage_session_group(p_session_id uuid, p_team1 uuid[], p_team2 uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_id uuid; v_all uuid[];
begin
  select * into v_s from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if open_play_is_over(p_session_id) then raise exception 'Session has ended'; end if;

  v_all := coalesce(p_team1, '{}') || coalesce(p_team2, '{}');
  -- players must be available (queued or resting) in this session
  if exists (select 1 from session_players where id = any(v_all) and (session_id <> p_session_id or status not in ('queued','resting'))) then
    raise exception 'One or more players are not available';
  end if;

  insert into session_games (session_id, court_number, team1_ids, team2_ids, status)
  values (p_session_id, null, coalesce(p_team1,'{}'), coalesce(p_team2,'{}'), 'staged')
  returning id into v_id;
  update session_players set status = 'staged' where id = any(v_all);
  return v_id;
end;
$$;
grant execute on function stage_session_group(uuid, uuid[], uuid[]) to authenticated;

-- ── set the players in a staged group (place / remove / rearrange) ───────────
create or replace function set_session_group(p_game_id uuid, p_team1 uuid[], p_team2 uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare v_g session_games%rowtype; v_s play_sessions%rowtype; v_new uuid[]; v_old uuid[]; v_added uuid[]; v_removed uuid[]; v_pid uuid; v_order int;
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Group not found'; end if;
  if v_g.status <> 'staged' then raise exception 'That group is already on a court'; end if;
  select * into v_s from play_sessions where id = v_g.session_id;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;

  v_new := coalesce(p_team1,'{}') || coalesce(p_team2,'{}');
  v_old := coalesce(v_g.team1_ids,'{}') || coalesce(v_g.team2_ids,'{}');
  select array(select unnest(v_new) except select unnest(v_old)) into v_added;
  select array(select unnest(v_old) except select unnest(v_new)) into v_removed;

  -- added players must currently be available in this session
  if exists (select 1 from session_players where id = any(v_added) and (session_id <> v_g.session_id or status not in ('queued','resting'))) then
    raise exception 'One or more players are not available';
  end if;

  update session_games set team1_ids = coalesce(p_team1,'{}'), team2_ids = coalesce(p_team2,'{}') where id = p_game_id;
  update session_players set status = 'staged' where id = any(v_added);
  -- removed players go to the back of the queue
  foreach v_pid in array coalesce(v_removed,'{}') loop
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_g.session_id;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = v_pid;
  end loop;
end;
$$;
grant execute on function set_session_group(uuid, uuid[], uuid[]) to authenticated;

-- ── lock / unlock a staged group ────────────────────────────────────────────
create or replace function lock_session_group(p_game_id uuid, p_locked boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_lid uuid;
begin
  select ps.league_id into v_lid from session_games g join play_sessions ps on ps.id = g.session_id where g.id = p_game_id;
  if not found then raise exception 'Group not found'; end if;
  if not is_session_organizer(v_lid) then raise exception 'Not authorised'; end if;
  update session_games set locked = p_locked where id = p_game_id and status = 'staged';
end;
$$;
grant execute on function lock_session_group(uuid, boolean) to authenticated;

-- ── send a staged group to a court ──────────────────────────────────────────
create or replace function assign_session_group(p_game_id uuid, p_court int)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_g session_games%rowtype; v_s play_sessions%rowtype; v_all uuid[];
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Group not found'; end if;
  if v_g.status <> 'staged' then raise exception 'That group is already on a court'; end if;
  select * into v_s from play_sessions where id = v_g.session_id;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if open_play_is_over(v_g.session_id) then raise exception 'Session has ended'; end if;

  if coalesce(array_length(v_g.team1_ids,1),0) = 0 or coalesce(array_length(v_g.team2_ids,1),0) = 0 then
    raise exception 'Both sides need players before sending to a court';
  end if;
  if exists (select 1 from session_games where session_id = v_g.session_id and status = 'in_progress' and court_number = p_court) then
    raise exception 'That court is already in use';
  end if;

  v_all := v_g.team1_ids || v_g.team2_ids;
  update session_games set status = 'in_progress', court_number = p_court, locked = false, started_at = now() where id = p_game_id;
  update session_players set status = 'playing' where id = any(v_all);
end;
$$;
grant execute on function assign_session_group(uuid, int) to authenticated;

-- ── disband a staged group (players back to queue) ──────────────────────────
create or replace function disband_session_group(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_g session_games%rowtype; v_lid uuid; v_pid uuid; v_order int; v_all uuid[];
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Group not found'; end if;
  if v_g.status <> 'staged' then raise exception 'That group is already on a court'; end if;
  select league_id into v_lid from play_sessions where id = v_g.session_id;
  if not is_session_organizer(v_lid) then raise exception 'Not authorised'; end if;

  v_all := coalesce(v_g.team1_ids,'{}') || coalesce(v_g.team2_ids,'{}');
  foreach v_pid in array v_all loop
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_g.session_id;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now()
      where id = v_pid and status = 'staged';
  end loop;
  delete from session_games where id = p_game_id;
end;
$$;
grant execute on function disband_session_group(uuid) to authenticated;

-- ── substitute a player in a live or staged game ────────────────────────────
create or replace function sub_session_player(p_game_id uuid, p_out uuid, p_in uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_g session_games%rowtype; v_lid uuid; v_t1 uuid[]; v_t2 uuid[]; v_new_status text; v_order int;
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Game not found'; end if;
  if v_g.status not in ('staged','in_progress') then raise exception 'That game is finished'; end if;
  select league_id into v_lid from play_sessions where id = v_g.session_id;
  if not is_session_organizer(v_lid) then raise exception 'Not authorised'; end if;

  if not (p_out = any(v_g.team1_ids) or p_out = any(v_g.team2_ids)) then raise exception 'That player is not in this game'; end if;
  if exists (select 1 from session_players where id = p_in and (session_id <> v_g.session_id or status not in ('queued','resting'))) then
    raise exception 'Replacement is not available';
  end if;

  v_t1 := array_replace(v_g.team1_ids, p_out, p_in);
  v_t2 := array_replace(v_g.team2_ids, p_out, p_in);
  update session_games set team1_ids = v_t1, team2_ids = v_t2 where id = p_game_id;

  v_new_status := case when v_g.status = 'in_progress' then 'playing' else 'staged' end;
  update session_players set status = v_new_status where id = p_in;
  select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_g.session_id;
  update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = p_out;
end;
$$;
grant execute on function sub_session_player(uuid, uuid, uuid) to authenticated;

-- ── reset queued_since when players return to the queue ─────────────────────
create or replace function set_session_player_status(p_player_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_lid uuid; v_sid uuid; v_order int;
begin
  select ps.league_id, sp.session_id into v_lid, v_sid
  from session_players sp join play_sessions ps on ps.id = sp.session_id where sp.id = p_player_id;
  if not found then raise exception 'Player not found'; end if;
  if not is_session_organizer(v_lid) then raise exception 'Not authorised'; end if;
  if p_status = 'queued' then
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_sid;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = p_player_id;
  else
    update session_players set status = p_status where id = p_player_id;
  end if;
end;
$$;
grant execute on function set_session_player_status(uuid, text) to authenticated;

-- ── complete_session_game: same as before, but reset queued_since on requeue ─
create or replace function complete_session_game(p_game_id uuid, p_winner int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_g session_games%rowtype; v_s play_sessions%rowtype;
  v_all_ids uuid[]; v_win_ids uuid[]; v_lose_ids uuid[];
  v_all_members boolean; v_match_id uuid; v_uid uuid; v_elo int; v_pid uuid; v_order int;
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Game not found'; end if;
  select * into v_s from play_sessions where id = v_g.session_id;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if v_g.status = 'completed' then raise exception 'Game already recorded'; end if;
  if p_winner not in (1, 2) then raise exception 'Winner must be team 1 or 2'; end if;

  v_win_ids  := case when p_winner = 1 then v_g.team1_ids else v_g.team2_ids end;
  v_lose_ids := case when p_winner = 1 then v_g.team2_ids else v_g.team1_ids end;
  v_all_ids  := v_g.team1_ids || v_g.team2_ids;

  v_all_members := v_s.rated
    and (select count(*) from session_players where id = any(v_all_ids) and user_id is null) = 0;

  if v_all_members then
    insert into matches (league_id, format, status, created_by, max_points,
                         team1_score, team2_score, completed_at, notes)
    values (v_s.league_id, v_s.format::match_format, 'completed', auth.uid(), 11,
            case when p_winner = 1 then 11 else 9 end,
            case when p_winner = 2 then 11 else 9 end,
            now(), 'Open play — ' || v_s.name)
    returning id into v_match_id;

    foreach v_pid in array v_g.team1_ids loop
      select user_id into v_uid from session_players where id = v_pid;
      select elo_rating into v_elo from league_members where league_id = v_s.league_id and user_id = v_uid;
      insert into match_players (match_id, user_id, team, elo_before) values (v_match_id, v_uid, 1, coalesce(v_elo, 1000));
    end loop;
    foreach v_pid in array v_g.team2_ids loop
      select user_id into v_uid from session_players where id = v_pid;
      select elo_rating into v_elo from league_members where league_id = v_s.league_id and user_id = v_uid;
      insert into match_players (match_id, user_id, team, elo_before) values (v_match_id, v_uid, 2, coalesce(v_elo, 1000));
    end loop;

    perform process_match_result(v_match_id);
  end if;

  update session_players set wins = wins + 1, games = games + 1 where id = any(v_win_ids);
  update session_players set losses = losses + 1, games = games + 1 where id = any(v_lose_ids);

  foreach v_pid in array v_all_ids loop
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_s.id;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now()
      where id = v_pid and status = 'playing';
  end loop;

  update session_games set status = 'completed', winner_team = p_winner,
         match_id = v_match_id, completed_at = now()
  where id = p_game_id;
end;
$$;
grant execute on function complete_session_game(uuid, int) to authenticated;
