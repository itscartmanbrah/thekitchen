-- Open Play: live drop-in sessions with a queue + auto-rotated courts.
--
-- An organizer (admin/officiator) runs a session inside a league. Members and
-- ad-hoc guests check in; the organizer's device builds balanced courts and
-- records winners. When a session is "rated" AND every player in a game is a
-- league member, the game is recorded as a real match so it feeds league ELO.
--
-- Writes go through security-definer RPCs (mirrors challenges/tournaments).

create table play_sessions (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  name        text not null,
  court_count int  not null check (court_count between 1 and 15),
  format      text not null check (format in ('singles', 'doubles')),
  match_mode  text not null default 'balanced' check (match_mode in ('balanced', 'skill', 'mixed', 'ladder')),
  rated       boolean not null default false,
  status      text not null default 'active' check (status in ('active', 'ended')),
  share_code  text not null unique default substr(md5(random()::text), 1, 8),
  created_by  uuid not null references auth.users(id),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

create table session_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references play_sessions(id) on delete cascade,
  user_id      uuid references auth.users(id),     -- null for guests
  guest_name   text,                               -- null for members
  display_name text not null,
  avatar_color text not null default '#16a34a',
  skill        int  not null default 1000,         -- used only for balancing
  status       text not null default 'queued' check (status in ('queued', 'playing', 'resting', 'left')),
  queue_order  int  not null default 0,
  wins         int  not null default 0,
  losses       int  not null default 0,
  games        int  not null default 0,
  created_at   timestamptz not null default now()
);

create table session_games (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references play_sessions(id) on delete cascade,
  court_number int  not null,
  team1_ids    uuid[] not null,   -- session_player ids
  team2_ids    uuid[] not null,
  status       text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  winner_team  int check (winner_team in (1, 2)),
  match_id     uuid references matches(id),
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_play_sessions_league on play_sessions(league_id, status);
create index idx_session_players_session on session_players(session_id, status);
create index idx_session_games_session on session_games(session_id, status);

alter table play_sessions enable row level security;
alter table session_players enable row level security;
alter table session_games enable row level security;

create policy "League members can view play sessions"
  on play_sessions for select using (league_id in (select auth_user_league_ids()));
create policy "League members can view session players"
  on session_players for select using (
    session_id in (select id from play_sessions where league_id in (select auth_user_league_ids()))
  );
create policy "League members can view session games"
  on session_games for select using (
    session_id in (select id from play_sessions where league_id in (select auth_user_league_ids()))
  );

-- ── helper: is the caller an organizer (admin/officiator) of this league ────
create or replace function is_session_organizer(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from league_members
    where league_id = p_league_id and user_id = auth.uid()
      and role in ('head_admin', 'admin', 'officiator') and status = 'active'
  );
$$;

-- ── create_play_session ─────────────────────────────────────────────────────
create or replace function create_play_session(
  p_league_id  uuid,
  p_name       text,
  p_court_count int,
  p_format     text,
  p_match_mode text,
  p_rated      boolean
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not is_session_organizer(p_league_id) then
    raise exception 'Only admins or officiators can run Open Play sessions';
  end if;
  insert into play_sessions (league_id, name, court_count, format, match_mode, rated, created_by)
  values (p_league_id, p_name, p_court_count, p_format,
          coalesce(p_match_mode, 'balanced'), coalesce(p_rated, false), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_play_session(uuid, text, int, text, text, boolean) to authenticated;

-- ── add_session_player (member or guest) ────────────────────────────────────
create or replace function add_session_player(
  p_session_id uuid,
  p_user_id    uuid,        -- null for guest
  p_guest_name text,        -- null for member
  p_skill      int          -- null = derive
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_s     play_sessions%rowtype;
  v_name  text;
  v_color text;
  v_skill int;
  v_order int;
  v_id    uuid;
begin
  select * into v_s from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if v_s.status <> 'active' then raise exception 'Session has ended'; end if;

  if p_user_id is not null then
    select coalesce(nullif(trim(coalesce(first_name,'')||' '||coalesce(last_name,'')),''), display_name),
           avatar_color
      into v_name, v_color from profiles where id = p_user_id;
    select coalesce(p_skill, case when v_s.format = 'doubles'
              then coalesce(doubles_elo, elo_rating) else coalesce(singles_elo, elo_rating) end, 1000)
      into v_skill from league_members where league_id = v_s.league_id and user_id = p_user_id;
    -- prevent duplicate member entry
    if exists (select 1 from session_players where session_id = p_session_id and user_id = p_user_id and status <> 'left') then
      raise exception 'That player is already in this session';
    end if;
  else
    if coalesce(trim(p_guest_name), '') = '' then raise exception 'Guest name required'; end if;
    v_name := trim(p_guest_name);
    v_color := '#64748b';
    v_skill := coalesce(p_skill, 1000);
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

-- ── update_session_player (status / skill) and remove ───────────────────────
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
  -- coming back to the queue goes to the back
  if p_status = 'queued' then
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_sid;
    update session_players set status = 'queued', queue_order = v_order where id = p_player_id;
  else
    update session_players set status = p_status where id = p_player_id;
  end if;
end;
$$;
grant execute on function set_session_player_status(uuid, text) to authenticated;

-- ── create_session_game (organizer's device sends chosen teams) ─────────────
create or replace function create_session_game(
  p_session_id  uuid,
  p_court       int,
  p_team1       uuid[],
  p_team2       uuid[]
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_id uuid;
begin
  select * into v_s from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if v_s.status <> 'active' then raise exception 'Session has ended'; end if;

  insert into session_games (session_id, court_number, team1_ids, team2_ids)
  values (p_session_id, p_court, p_team1, p_team2)
  returning id into v_id;

  update session_players set status = 'playing'
  where id = any(p_team1 || p_team2);
  return v_id;
end;
$$;
grant execute on function create_session_game(uuid, int, uuid[], uuid[]) to authenticated;

-- ── complete_session_game: record result, stats, and ELO when applicable ────
create or replace function complete_session_game(p_game_id uuid, p_winner int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_g       session_games%rowtype;
  v_s       play_sessions%rowtype;
  v_all_ids uuid[];
  v_win_ids uuid[];
  v_lose_ids uuid[];
  v_member_users uuid[];
  v_all_members boolean;
  v_match_id uuid;
  v_uid uuid;
  v_elo int;
  v_pid uuid;
  v_order int;
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

  -- Rated ELO only when the session is rated and every player is a member
  select array_agg(user_id) filter (where user_id is not null)
    into v_member_users from session_players where id = any(v_all_ids);
  v_all_members := v_s.rated
    and (select count(*) from session_players where id = any(v_all_ids) and user_id is null) = 0;

  if v_all_members then
    -- nominal scores: open play records a winner, so count it as a standard win
    insert into matches (league_id, format, status, created_by, max_points,
                         team1_score, team2_score, completed_at, notes)
    values (v_s.league_id, v_s.format, 'completed', auth.uid(), 11,
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

  -- Session stats + return players to the back of the queue
  update session_players set wins = wins + 1, games = games + 1 where id = any(v_win_ids);
  update session_players set losses = losses + 1, games = games + 1 where id = any(v_lose_ids);

  -- requeue in original order (winners then losers keeps it simple)
  foreach v_pid in array v_all_ids loop
    select coalesce(max(queue_order),0)+1 into v_order from session_players where session_id = v_s.id;
    update session_players set status = 'queued', queue_order = v_order
      where id = v_pid and status = 'playing';
  end loop;

  update session_games set status = 'completed', winner_team = p_winner,
         match_id = v_match_id, completed_at = now()
  where id = p_game_id;
end;
$$;
grant execute on function complete_session_game(uuid, int) to authenticated;

-- ── end_play_session ─────────────────────────────────────────────────────────
create or replace function end_play_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_lid uuid;
begin
  select league_id into v_lid from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_session_organizer(v_lid) then raise exception 'Not authorised'; end if;
  update play_sessions set status = 'ended', ended_at = now() where id = p_session_id;
end;
$$;
grant execute on function end_play_session(uuid) to authenticated;

-- ── get_open_play_public: phone view by share code (no login) ───────────────
create or replace function get_open_play_public(p_share_code text)
returns json
language sql security definer stable set search_path = public
as $$
  select json_build_object(
    'session', (
      select json_build_object('id', s.id, 'name', s.name, 'format', s.format,
        'court_count', s.court_count, 'status', s.status, 'rated', s.rated,
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
