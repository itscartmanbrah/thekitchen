-- Standalone (no-login) Open Play: sessions can exist WITHOUT a league, owned by
-- whoever created them (an anonymous account). Authorisation switches from
-- "league organizer" to can_manage_session() = "I created it OR I'm an organizer
-- of its league". No league = no ELO (rated is forced false).

-- 1) Sessions no longer require a league.
alter table play_sessions alter column league_id drop not null;

-- 2) Unified "can I manage this session?" check.
create or replace function can_manage_session(p_session_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from play_sessions s
    where s.id = p_session_id
      and (s.created_by = auth.uid()
           or (s.league_id is not null and is_session_organizer(s.league_id)))
  );
$$;
grant execute on function can_manage_session(uuid) to authenticated;

-- 3) Create a leagueless session (callable by any signed-in user, incl. anon).
create or replace function create_solo_session(
  p_name text, p_court_count int, p_format text, p_match_mode text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name your session'; end if;
  insert into play_sessions (league_id, name, court_count, court_ids, format, match_mode, rated,
                             allow_self_join, starts_at, started_at, ends_at, status, created_by)
  values (null, trim(p_name), greatest(1, least(15, coalesce(p_court_count, 1))), null,
          coalesce(p_format, 'doubles'), coalesce(p_match_mode, 'balanced'), false,
          true, now(), now(), null, 'active', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_solo_session(text, int, text, text) to authenticated;

-- 4) RLS: a creator can read their own session + its players/games (read for
--    league members already exists; this adds the standalone-owner path).
drop policy if exists "Creators view own sessions" on play_sessions;
create policy "Creators view own sessions" on play_sessions
  for select using (created_by = auth.uid());
drop policy if exists "Creators view own session players" on session_players;
create policy "Creators view own session players" on session_players
  for select using (session_id in (select id from play_sessions where created_by = auth.uid()));
drop policy if exists "Creators view own session games" on session_games;
create policy "Creators view own session games" on session_games
  for select using (session_id in (select id from play_sessions where created_by = auth.uid()));

-- 5) Re-point the organizer RPCs onto can_manage_session() ─────────────────────

create or replace function add_session_player(p_session_id uuid, p_user_id uuid, p_guest_name text, p_skill int)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_name text; v_color text; v_skill int; v_order int; v_id uuid;
begin
  select * into v_s from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not can_manage_session(p_session_id) then raise exception 'Not authorised'; end if;
  if open_play_is_over(p_session_id) then raise exception 'Session has ended'; end if;
  if p_user_id is not null then
    select coalesce(nullif(trim(coalesce(first_name,'')||' '||coalesce(last_name,'')),''), display_name), avatar_color
      into v_name, v_color from profiles where id = p_user_id;
    select coalesce(p_skill, case when v_s.format = 'doubles' then coalesce(doubles_elo, elo_rating) else coalesce(singles_elo, elo_rating) end, 1000)
      into v_skill from league_members where league_id = v_s.league_id and user_id = p_user_id;
    if exists (select 1 from session_players where session_id = p_session_id and user_id = p_user_id and status <> 'left') then
      raise exception 'That player is already in this session';
    end if;
  else
    if coalesce(trim(p_guest_name), '') = '' then raise exception 'Guest name required'; end if;
    v_name := trim(p_guest_name); v_color := '#64748b'; v_skill := coalesce(p_skill, 1000);
  end if;
  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = p_session_id;
  insert into session_players (session_id, user_id, guest_name, display_name, avatar_color, skill, queue_order)
  values (p_session_id, p_user_id, case when p_user_id is null then v_name else null end,
          v_name, coalesce(v_color, '#16a34a'), coalesce(v_skill, 1000), v_order)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function add_session_player(uuid, uuid, text, int) to authenticated;

create or replace function set_session_player_status(p_player_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_sid uuid; v_order int;
begin
  select sp.session_id into v_sid from session_players sp where sp.id = p_player_id;
  if not found then raise exception 'Player not found'; end if;
  if not can_manage_session(v_sid) then raise exception 'Not authorised'; end if;
  if p_status = 'queued' then
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_sid;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = p_player_id;
  else
    update session_players set status = p_status where id = p_player_id;
  end if;
end;
$$;
grant execute on function set_session_player_status(uuid, text) to authenticated;

create or replace function stage_session_group(p_session_id uuid, p_team1 uuid[], p_team2 uuid[], p_rank int default null, p_round int default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_all uuid[];
begin
  if not can_manage_session(p_session_id) then raise exception 'Not authorised'; end if;
  if open_play_is_over(p_session_id) then raise exception 'Session has ended'; end if;
  v_all := coalesce(p_team1, '{}') || coalesce(p_team2, '{}');
  if exists (select 1 from session_players where id = any(v_all) and (session_id <> p_session_id or status not in ('queued','resting'))) then
    raise exception 'One or more players are not available';
  end if;
  insert into session_games (session_id, court_number, team1_ids, team2_ids, status, rank, round_no)
  values (p_session_id, null, coalesce(p_team1,'{}'), coalesce(p_team2,'{}'), 'staged', p_rank, p_round)
  returning id into v_id;
  update session_players set status = 'staged' where id = any(v_all);
  return v_id;
end;
$$;
grant execute on function stage_session_group(uuid, uuid[], uuid[], int, int) to authenticated;

create or replace function set_session_group(p_game_id uuid, p_team1 uuid[], p_team2 uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare v_g session_games%rowtype; v_new uuid[]; v_old uuid[]; v_added uuid[]; v_removed uuid[]; v_pid uuid; v_order int;
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Group not found'; end if;
  if v_g.status <> 'staged' then raise exception 'That group is already on a court'; end if;
  if not can_manage_session(v_g.session_id) then raise exception 'Not authorised'; end if;
  v_new := coalesce(p_team1,'{}') || coalesce(p_team2,'{}');
  v_old := coalesce(v_g.team1_ids,'{}') || coalesce(v_g.team2_ids,'{}');
  select array(select unnest(v_new) except select unnest(v_old)) into v_added;
  select array(select unnest(v_old) except select unnest(v_new)) into v_removed;
  if exists (select 1 from session_players where id = any(v_added) and (session_id <> v_g.session_id or status not in ('queued','resting'))) then
    raise exception 'One or more players are not available';
  end if;
  update session_games set team1_ids = coalesce(p_team1,'{}'), team2_ids = coalesce(p_team2,'{}') where id = p_game_id;
  update session_players set status = 'staged' where id = any(v_added);
  foreach v_pid in array coalesce(v_removed,'{}') loop
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_g.session_id;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = v_pid;
  end loop;
end;
$$;
grant execute on function set_session_group(uuid, uuid[], uuid[]) to authenticated;

create or replace function lock_session_group(p_game_id uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare v_sid uuid;
begin
  select session_id into v_sid from session_games where id = p_game_id;
  if not found then raise exception 'Group not found'; end if;
  if not can_manage_session(v_sid) then raise exception 'Not authorised'; end if;
  update session_games set locked = p_locked where id = p_game_id and status = 'staged';
end;
$$;
grant execute on function lock_session_group(uuid, boolean) to authenticated;

create or replace function assign_session_group(p_game_id uuid, p_court int)
returns void language plpgsql security definer set search_path = public
as $$
declare v_g session_games%rowtype; v_all uuid[];
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Group not found'; end if;
  if v_g.status <> 'staged' then raise exception 'That group is already on a court'; end if;
  if not can_manage_session(v_g.session_id) then raise exception 'Not authorised'; end if;
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

create or replace function disband_session_group(p_game_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_g session_games%rowtype; v_pid uuid; v_order int; v_all uuid[];
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Group not found'; end if;
  if v_g.status <> 'staged' then raise exception 'That group is already on a court'; end if;
  if not can_manage_session(v_g.session_id) then raise exception 'Not authorised'; end if;
  v_all := coalesce(v_g.team1_ids,'{}') || coalesce(v_g.team2_ids,'{}');
  foreach v_pid in array v_all loop
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_g.session_id;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = v_pid and status = 'staged';
  end loop;
  delete from session_games where id = p_game_id;
end;
$$;
grant execute on function disband_session_group(uuid) to authenticated;

create or replace function sub_session_player(p_game_id uuid, p_out uuid, p_in uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_g session_games%rowtype; v_t1 uuid[]; v_t2 uuid[]; v_new_status text; v_order int;
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Game not found'; end if;
  if v_g.status not in ('staged','in_progress') then raise exception 'That game is finished'; end if;
  if not can_manage_session(v_g.session_id) then raise exception 'Not authorised'; end if;
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

create or replace function complete_session_game(p_game_id uuid, p_t1 int, p_t2 int)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_g session_games%rowtype; v_s play_sessions%rowtype;
  v_all_ids uuid[]; v_win_ids uuid[]; v_lose_ids uuid[]; v_winner int;
  v_all_members boolean; v_match_id uuid; v_uid uuid; v_elo int; v_pid uuid; v_order int; v_max int;
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Game not found'; end if;
  select * into v_s from play_sessions where id = v_g.session_id;
  if not can_manage_session(v_g.session_id) then raise exception 'Not authorised'; end if;
  if v_g.status = 'completed' then raise exception 'Game already recorded'; end if;
  if p_t1 = p_t2 then raise exception 'Scores can''t be tied'; end if;

  v_winner   := case when p_t1 > p_t2 then 1 else 2 end;
  v_win_ids  := case when v_winner = 1 then v_g.team1_ids else v_g.team2_ids end;
  v_lose_ids := case when v_winner = 1 then v_g.team2_ids else v_g.team1_ids end;
  v_all_ids  := v_g.team1_ids || v_g.team2_ids;
  v_max      := greatest(p_t1, p_t2, 11);

  v_all_members := v_s.rated and v_s.league_id is not null
    and (select count(*) from session_players where id = any(v_all_ids) and user_id is null) = 0;

  if v_all_members then
    insert into matches (league_id, format, status, created_by, max_points, team1_score, team2_score, completed_at, notes)
    values (v_s.league_id, v_s.format::match_format, 'completed', auth.uid(), v_max, p_t1, p_t2, now(), 'Open play — ' || v_s.name)
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
    update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = v_pid and status = 'playing';
  end loop;
  update session_games set status = 'completed', winner_team = v_winner, team1_score = p_t1, team2_score = p_t2, match_id = v_match_id, completed_at = now()
  where id = p_game_id;
end;
$$;
grant execute on function complete_session_game(uuid, int, int) to authenticated;

create or replace function end_play_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not can_manage_session(p_session_id) then raise exception 'Not authorised'; end if;
  update play_sessions set status = 'ended', ended_at = now() where id = p_session_id;
end;
$$;
grant execute on function end_play_session(uuid) to authenticated;
