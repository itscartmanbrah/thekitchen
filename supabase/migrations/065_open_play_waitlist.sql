-- Optional max players + waitlist for Open Play.
--   * play_sessions.max_players (null = unlimited), adjustable live.
--   * When the session is full, new check-ins (guest, member, or organizer-added)
--     become status 'waitlisted' instead of joining the queue.
--   * FIFO promotion: when an active player leaves, the first waitlisted player
--     is auto-promoted into the queue. Raising the max promotes as many as fit.
--   * Waitlisted players can leave the waitlist (leave_open_play); everyone
--     behind them moves up automatically (ordering is by queue_order).

alter table play_sessions add column if not exists max_players int;
alter table play_sessions drop constraint if exists play_sessions_max_players_check;
alter table play_sessions add constraint play_sessions_max_players_check
  check (max_players is null or max_players between 2 and 200);

alter table session_players drop constraint if exists session_players_status_check;
alter table session_players add constraint session_players_status_check
  check (status in ('queued', 'playing', 'resting', 'left', 'staged', 'waitlisted'));

-- ── helpers ──────────────────────────────────────────────────────────────────
create or replace function open_play_is_full(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case when s.max_players is null then false
    else (select count(*) from session_players sp
          where sp.session_id = s.id and sp.status not in ('left', 'waitlisted')) >= s.max_players
  end
  from play_sessions s where s.id = p_session_id;
$$;

-- Promote waitlisted players (FIFO) while there's room.
create or replace function promote_open_play_waitlist(p_session_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_max int; v_active int; v_pid uuid; v_order int;
begin
  select max_players into v_max from play_sessions where id = p_session_id;
  if v_max is null then
    -- no cap (anymore): everyone waitlisted joins the queue
    for v_pid in (select id from session_players where session_id = p_session_id and status = 'waitlisted' order by queue_order) loop
      select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = p_session_id;
      update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = v_pid;
    end loop;
    return;
  end if;
  loop
    select count(*) into v_active from session_players
      where session_id = p_session_id and status not in ('left', 'waitlisted');
    exit when v_active >= v_max;
    select id into v_pid from session_players
      where session_id = p_session_id and status = 'waitlisted' order by queue_order limit 1;
    exit when v_pid is null;
    select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = p_session_id;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = v_pid;
  end loop;
end;
$$;

-- Organizer sets/changes the cap live (null = no limit). Raising it (or removing
-- it) promotes from the waitlist immediately.
create or replace function set_session_max_players(p_session_id uuid, p_max int)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not can_manage_session(p_session_id) then raise exception 'Not authorised'; end if;
  if p_max is not null and (p_max < 2 or p_max > 200) then raise exception 'Max players must be between 2 and 200'; end if;
  update play_sessions set max_players = p_max where id = p_session_id;
  perform promote_open_play_waitlist(p_session_id);
end;
$$;
grant execute on function set_session_max_players(uuid, int) to authenticated;

-- ── joins go to the waitlist when full ───────────────────────────────────────
create or replace function join_open_play(p_share_code text, p_guest_name text, p_skill_level int, p_gender text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_order int; v_id uuid; v_name text; v_existing uuid; v_existing_status text; v_status text;
begin
  select * into v_s from play_sessions where share_code = p_share_code;
  if not found then raise exception 'Session not found'; end if;
  if v_s.status <> 'active' then raise exception 'This session has ended'; end if;
  if not v_s.allow_self_join then raise exception 'Self check-in is turned off for this session'; end if;

  v_name := trim(coalesce(p_guest_name, ''));
  if v_name = '' then raise exception 'Please enter your name'; end if;
  if length(v_name) > 40 then v_name := substr(v_name, 1, 40); end if;

  select id, status into v_existing, v_existing_status from session_players
  where session_id = v_s.id and user_id is null
    and lower(display_name) = lower(v_name)
  order by (status <> 'left') desc, queue_order
  limit 1;
  if v_existing is not null then
    if v_existing_status = 'left' then
      v_status := case when open_play_is_full(v_s.id) then 'waitlisted' else 'queued' end;
      select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
      update session_players set status = v_status, queue_order = v_order, queued_since = now() where id = v_existing;
    end if;
    return v_existing;
  end if;

  v_status := case when open_play_is_full(v_s.id) then 'waitlisted' else 'queued' end;
  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
  insert into session_players (session_id, guest_name, display_name, avatar_color, skill, skill_level, gender, queue_order, status)
  values (v_s.id, v_name, v_name, '#64748b', 1000,
          case when p_skill_level between 1 and 5 then p_skill_level else null end,
          case when p_gender in ('m', 'f') then p_gender else null end,
          v_order, v_status)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function join_open_play(text, text, int, text) to anon, authenticated;

create or replace function join_open_play_member(p_share_code text, p_skill_level int, p_gender text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_s play_sessions%rowtype; v_uid uuid := auth.uid();
  v_name text; v_color text; v_pgender text; v_gender text;
  v_order int; v_id uuid; v_existing uuid; v_status text; v_new_status text;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  select * into v_s from play_sessions where share_code = p_share_code;
  if not found then raise exception 'Session not found'; end if;
  if v_s.status <> 'active' then raise exception 'This session has ended'; end if;
  if not v_s.allow_self_join then raise exception 'Self check-in is turned off for this session'; end if;

  select id, status into v_existing, v_status from session_players
  where session_id = v_s.id and user_id = v_uid
  order by (status <> 'left') desc limit 1;
  if v_existing is not null then
    if v_status = 'left' then
      v_new_status := case when open_play_is_full(v_s.id) then 'waitlisted' else 'queued' end;
      select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
      update session_players set status = v_new_status, queue_order = v_order, queued_since = now() where id = v_existing;
    end if;
    return v_existing;
  end if;

  select coalesce(nullif(trim(display_name), ''), nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Player'),
         avatar_color,
         case gender when 'male' then 'm' when 'female' then 'f' else null end
    into v_name, v_color, v_pgender
  from profiles where id = v_uid;

  v_gender := coalesce(case when p_gender in ('m', 'f') then p_gender else null end, v_pgender);
  v_new_status := case when open_play_is_full(v_s.id) then 'waitlisted' else 'queued' end;

  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
  insert into session_players (session_id, user_id, display_name, avatar_color, skill, skill_level, gender, queue_order, status)
  values (v_s.id, v_uid, v_name, coalesce(v_color, '#16a34a'), 1000,
          case when p_skill_level between 1 and 5 then p_skill_level else null end,
          v_gender, v_order, v_new_status)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function join_open_play_member(text, int, text) to authenticated;

-- Organizer adds also respect the cap (new players land on the waitlist).
create or replace function add_session_player(p_session_id uuid, p_user_id uuid, p_guest_name text, p_skill int)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_name text; v_color text; v_skill int; v_order int; v_id uuid; v_status text;
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
  v_status := case when open_play_is_full(p_session_id) then 'waitlisted' else 'queued' end;
  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = p_session_id;
  insert into session_players (session_id, user_id, guest_name, display_name, avatar_color, skill, queue_order, status)
  values (p_session_id, p_user_id, case when p_user_id is null then v_name else null end,
          v_name, coalesce(v_color, '#16a34a'), coalesce(v_skill, 1000), v_order, v_status)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function add_session_player(uuid, uuid, text, int) to authenticated;

-- ── leaving frees a spot → promote the first waitlisted ─────────────────────
create or replace function leave_open_play(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text; v_sid uuid;
begin
  select status, session_id into v_status, v_sid from session_players where id = p_player_id;
  if not found then raise exception 'Not found'; end if;
  if v_status = 'playing' then raise exception 'You are on a court right now — finish your game first'; end if;
  update session_players set status = 'left' where id = p_player_id;
  -- leaving the waitlist doesn't free a playing spot; an active player leaving does
  if v_status <> 'waitlisted' then perform promote_open_play_waitlist(v_sid); end if;
end;
$$;
grant execute on function leave_open_play(uuid) to anon, authenticated;

-- Organizer status changes: removing an active player promotes from the waitlist.
create or replace function set_session_player_status(p_player_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_sid uuid; v_order int; v_old text;
begin
  select sp.session_id, sp.status into v_sid, v_old from session_players sp where sp.id = p_player_id;
  if not found then raise exception 'Player not found'; end if;
  if not can_manage_session(v_sid) then raise exception 'Not authorised'; end if;
  if p_status = 'queued' then
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_sid;
    update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = p_player_id;
  else
    update session_players set status = p_status where id = p_player_id;
  end if;
  if p_status = 'left' and v_old <> 'waitlisted' then perform promote_open_play_waitlist(v_sid); end if;
end;
$$;
grant execute on function set_session_player_status(uuid, text) to authenticated;

-- Self-service "I'm back" can't be used to jump the waitlist.
create or replace function backin_open_play(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_sid uuid; v_status text; v_order int;
begin
  select session_id, status into v_sid, v_status from session_players where id = p_player_id;
  if not found then raise exception 'Not found'; end if;
  if v_status = 'left' then raise exception 'You have checked out — check in again to rejoin'; end if;
  if v_status = 'waitlisted' then raise exception 'You are on the waitlist — you''ll be checked in automatically when a spot frees'; end if;
  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_sid;
  update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = p_player_id;
end;
$$;
grant execute on function backin_open_play(uuid) to anon, authenticated;

-- ── expose max_players in the public payload ─────────────────────────────────
create or replace function get_open_play_public(p_share_code text)
returns json language sql security definer stable set search_path = public
as $$
  select json_build_object(
    'session', (
      select json_build_object('id', s.id, 'name', s.name, 'format', s.format,
        'court_count', s.court_count, 'rated', s.rated, 'allow_self_join', s.allow_self_join,
        'match_mode', s.match_mode, 'max_players', s.max_players,
        'starts_at', s.starts_at, 'ends_at', s.ends_at,
        'status', case
          when s.ended_at is not null or (s.ends_at is not null and now() > s.ends_at) then 'ended'
          when s.starts_at is not null and s.starts_at > now() then 'scheduled'
          else 'active' end,
        'league_name', (select name from leagues where id = s.league_id))
      from play_sessions s where s.share_code = p_share_code
    ),
    'players', (
      select coalesce(json_agg(json_build_object(
        'id', sp.id, 'name', sp.display_name, 'avatar_color', sp.avatar_color,
        'status', sp.status, 'queue_order', sp.queue_order, 'wins', sp.wins, 'losses', sp.losses, 'games', sp.games
      ) order by sp.queue_order), '[]'::json)
      from session_players sp where sp.session_id = (select id from play_sessions where share_code = p_share_code)
        and sp.status <> 'left'
    ),
    'games', (
      select coalesce(json_agg(json_build_object(
        'id', g.id, 'court', g.court_number, 'team1', g.team1_ids, 'team2', g.team2_ids,
        'status', g.status, 'winner_team', g.winner_team, 'started_at', g.started_at
      ) order by g.court_number), '[]'::json)
      from session_games g where g.session_id = (select id from play_sessions where share_code = p_share_code)
        and g.status = 'in_progress'
    ),
    'on_deck', (
      select coalesce(json_agg(json_build_object(
        'id', g.id, 'team1', g.team1_ids, 'team2', g.team2_ids
      ) order by g.id), '[]'::json)
      from session_games g where g.session_id = (select id from play_sessions where share_code = p_share_code)
        and g.status = 'staged'
        and coalesce(array_length(g.team1_ids, 1), 0) + coalesce(array_length(g.team2_ids, 1), 0) > 0
    )
  );
$$;
grant execute on function get_open_play_public(text) to anon, authenticated;
