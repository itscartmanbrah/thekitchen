-- Open Play self check-in: let people without an account add themselves to the
-- queue from the public share link (PickleQ-style), as guests.

alter table play_sessions add column if not exists allow_self_join boolean not null default true;

-- ── join_open_play: anon adds themselves as a guest via the share code ───────
create or replace function join_open_play(p_share_code text, p_guest_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_order int; v_id uuid; v_name text;
begin
  select * into v_s from play_sessions where share_code = p_share_code;
  if not found then raise exception 'Session not found'; end if;
  if v_s.status <> 'active' then raise exception 'This session has ended'; end if;
  if not v_s.allow_self_join then raise exception 'Self check-in is turned off for this session'; end if;

  v_name := trim(coalesce(p_guest_name, ''));
  if v_name = '' then raise exception 'Please enter your name'; end if;
  if length(v_name) > 40 then v_name := substr(v_name, 1, 40); end if;

  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
  insert into session_players (session_id, guest_name, display_name, avatar_color, skill, queue_order)
  values (v_s.id, v_name, v_name, '#64748b', 1000, v_order)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function join_open_play(text, text) to anon, authenticated;

-- ── leave_open_play: a self-joined player removes themselves ─────────────────
create or replace function leave_open_play(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from session_players where id = p_player_id;
  if not found then raise exception 'Not found'; end if;
  if v_status = 'playing' then raise exception 'You are on a court right now — finish your game first'; end if;
  update session_players set status = 'left' where id = p_player_id;
end;
$$;
grant execute on function leave_open_play(uuid) to anon, authenticated;

-- ── set_session_self_join: organizer toggles self check-in ───────────────────
create or replace function set_session_self_join(p_session_id uuid, p_allow boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_lid uuid;
begin
  select league_id into v_lid from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_session_organizer(v_lid) then raise exception 'Not authorised'; end if;
  update play_sessions set allow_self_join = p_allow where id = p_session_id;
end;
$$;
grant execute on function set_session_self_join(uuid, boolean) to authenticated;

-- ── expose allow_self_join in the public payload ────────────────────────────
create or replace function get_open_play_public(p_share_code text)
returns json
language sql security definer stable set search_path = public
as $$
  select json_build_object(
    'session', (
      select json_build_object('id', s.id, 'name', s.name, 'format', s.format,
        'court_count', s.court_count, 'status', s.status, 'rated', s.rated,
        'allow_self_join', s.allow_self_join,
        'league_name', (select name from leagues where id = s.league_id))
      from play_sessions s where s.share_code = p_share_code
    ),
    'players', (
      select coalesce(json_agg(json_build_object(
        'id', sp.id, 'name', sp.display_name, 'avatar_color', sp.avatar_color,
        'status', sp.status, 'queue_order', sp.queue_order,
        'wins', sp.wins, 'losses', sp.losses, 'games', sp.games
      ) order by sp.queue_order), '[]'::json)
      from session_players sp
      where sp.session_id = (select id from play_sessions where share_code = p_share_code)
        and sp.status <> 'left'
    ),
    'games', (
      select coalesce(json_agg(json_build_object(
        'id', g.id, 'court', g.court_number, 'team1', g.team1_ids, 'team2', g.team2_ids,
        'status', g.status, 'winner_team', g.winner_team
      ) order by g.court_number), '[]'::json)
      from session_games g
      where g.session_id = (select id from play_sessions where share_code = p_share_code)
        and g.status = 'in_progress'
    )
  );
$$;
grant execute on function get_open_play_public(text) to anon, authenticated;
