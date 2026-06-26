-- Let self check-in (QR / share link) capture the player's gender (Mixed
-- Doubles) and skill level (Skill-separated / Skill Courts), and expose the
-- session's match_mode so the public page knows which to ask for.

-- Keep the original 2-arg join_open_play in place and add a 4-arg overload, so
-- the new client works after this runs while old/cached clients keep working in
-- the window before it's applied (no self-check-in downtime).
create or replace function join_open_play(p_share_code text, p_guest_name text, p_skill_level int, p_gender text)
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
  insert into session_players (session_id, guest_name, display_name, avatar_color, skill, skill_level, gender, queue_order)
  values (v_s.id, v_name, v_name, '#64748b', 1000,
          case when p_skill_level between 1 and 5 then p_skill_level else null end,
          case when p_gender in ('m', 'f') then p_gender else null end,
          v_order)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function join_open_play(text, text, int, text) to anon, authenticated;

-- Add match_mode to the public payload.
create or replace function get_open_play_public(p_share_code text)
returns json language sql security definer stable set search_path = public
as $$
  select json_build_object(
    'session', (
      select json_build_object('id', s.id, 'name', s.name, 'format', s.format,
        'court_count', s.court_count, 'rated', s.rated, 'allow_self_join', s.allow_self_join,
        'match_mode', s.match_mode,
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
