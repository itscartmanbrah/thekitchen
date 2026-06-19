-- Open Play: scheduled start/end times + linkage to specific courts.
--   - A session has starts_at / ends_at and a set of court_ids it occupies.
--   - It auto-finishes once now() passes ends_at (derived, no cron needed).
--   - Admins can still end it manually anytime.
--   - Its court hours show as blocked "Open Play" in the booking calendar.

alter table play_sessions
  add column if not exists starts_at  timestamptz,
  add column if not exists ends_at    timestamptz,
  add column if not exists court_ids  uuid[];

update play_sessions set starts_at = started_at where starts_at is null;

alter table play_sessions drop constraint if exists play_sessions_status_check;
alter table play_sessions add constraint play_sessions_status_check
  check (status in ('scheduled', 'active', 'ended'));

-- ── create_play_session: now takes courts + start/end ───────────────────────
drop function if exists create_play_session(uuid, text, int, text, text, boolean);
create or replace function create_play_session(
  p_league_id   uuid,
  p_name        text,
  p_court_ids   uuid[],
  p_format      text,
  p_match_mode  text,
  p_rated       boolean,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_allow_self_join boolean default true
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_n int;
begin
  if not is_session_organizer(p_league_id) then
    raise exception 'Only admins or officiators can run Open Play sessions';
  end if;
  v_n := coalesce(array_length(p_court_ids, 1), 0);
  if v_n = 0 then raise exception 'Select at least one court'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End time must be after the start time';
  end if;
  -- courts must belong to this league
  if exists (select 1 from unnest(p_court_ids) c where c not in (select id from courts where league_id = p_league_id)) then
    raise exception 'One or more courts are not in this league';
  end if;

  insert into play_sessions (league_id, name, court_count, court_ids, format, match_mode, rated,
                             allow_self_join, starts_at, started_at, ends_at, status, created_by)
  values (p_league_id, p_name, v_n, p_court_ids, p_format, coalesce(p_match_mode, 'balanced'),
          coalesce(p_rated, false), coalesce(p_allow_self_join, true),
          coalesce(p_starts_at, now()), coalesce(p_starts_at, now()), p_ends_at,
          case when coalesce(p_starts_at, now()) > now() then 'scheduled' else 'active' end,
          auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_play_session(uuid, text, uuid[], text, text, boolean, timestamptz, timestamptz, boolean) to authenticated;

-- ── helper: a session is finished if ended manually or past its end time ────
create or replace function open_play_is_over(p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select ended_at is not null or (ends_at is not null and now() > ends_at)
  from play_sessions where id = p_id;
$$;

-- ── re-gate the action RPCs on "not over" instead of status='active' ────────
create or replace function add_session_player(
  p_session_id uuid, p_user_id uuid, p_guest_name text, p_skill int
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_s play_sessions%rowtype; v_name text; v_color text; v_skill int; v_order int; v_id uuid;
begin
  select * into v_s from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if open_play_is_over(p_session_id) then raise exception 'Session has ended'; end if;

  if p_user_id is not null then
    select coalesce(nullif(trim(coalesce(first_name,'')||' '||coalesce(last_name,'')),''), display_name), avatar_color
      into v_name, v_color from profiles where id = p_user_id;
    select coalesce(p_skill, case when v_s.format = 'doubles'
              then coalesce(doubles_elo, elo_rating) else coalesce(singles_elo, elo_rating) end, 1000)
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

create or replace function create_session_game(
  p_session_id uuid, p_court int, p_team1 uuid[], p_team2 uuid[]
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_id uuid;
begin
  select * into v_s from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if open_play_is_over(p_session_id) then raise exception 'Session has ended'; end if;
  insert into session_games (session_id, court_number, team1_ids, team2_ids)
  values (p_session_id, p_court, p_team1, p_team2) returning id into v_id;
  update session_players set status = 'playing' where id = any(p_team1 || p_team2);
  return v_id;
end;
$$;
grant execute on function create_session_game(uuid, int, uuid[], uuid[]) to authenticated;

-- ── public payload: derive effective status + include times ─────────────────
create or replace function get_open_play_public(p_share_code text)
returns json language sql security definer stable set search_path = public
as $$
  select json_build_object(
    'session', (
      select json_build_object('id', s.id, 'name', s.name, 'format', s.format,
        'court_count', s.court_count, 'rated', s.rated, 'allow_self_join', s.allow_self_join,
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
        'status', g.status, 'winner_team', g.winner_team
      ) order by g.court_number), '[]'::json)
      from session_games g where g.session_id = (select id from play_sessions where share_code = p_share_code)
        and g.status = 'in_progress'
    )
  );
$$;
grant execute on function get_open_play_public(text) to anon, authenticated;
