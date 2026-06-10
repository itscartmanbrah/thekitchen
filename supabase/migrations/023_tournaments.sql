-- Single-elimination tournaments (singles format, v1)
--
-- - Admins create a tournament from league members; seeding is automatic by ELO.
-- - Bracket is generated up front (all rounds); byes auto-advance top seeds.
-- - Reporting a score creates a real `matches` row and runs process_match_result,
--   so tournament games feed league ELO exactly like normal matches.
-- - Spectators can follow via a public share code (no account needed) through
--   the get_tournament_public RPC.

create table tournaments (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  name        text not null,
  status      text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  share_code  text not null unique default substr(md5(random()::text), 1, 8),
  created_by  uuid not null references auth.users(id),
  winner_id   uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  completed_at timestamptz
);

create table tournament_players (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  seed          int not null,
  unique (tournament_id, user_id),
  unique (tournament_id, seed)
);

create table tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round         int not null,           -- 1 = first round
  position      int not null,           -- 1-based within the round
  player1_id    uuid references auth.users(id),
  player2_id    uuid references auth.users(id),
  winner_id     uuid references auth.users(id),
  score1        int,
  score2        int,
  status        text not null default 'pending' check (status in ('pending', 'ready', 'completed', 'bye')),
  match_id      uuid references matches(id),
  unique (tournament_id, round, position)
);

create index idx_tournament_matches_tid on tournament_matches(tournament_id, round, position);
create index idx_tournaments_league on tournaments(league_id, created_at desc);

alter table tournaments enable row level security;
alter table tournament_players enable row level security;
alter table tournament_matches enable row level security;

create policy "League members can view tournaments"
  on tournaments for select using (league_id in (select auth_user_league_ids()));
create policy "League members can view tournament players"
  on tournament_players for select using (
    tournament_id in (select id from tournaments where league_id in (select auth_user_league_ids()))
  );
create policy "League members can view tournament matches"
  on tournament_matches for select using (
    tournament_id in (select id from tournaments where league_id in (select auth_user_league_ids()))
  );
-- All writes go through the security definer RPCs below.

-- ── create_tournament: seed by ELO, build full bracket with byes ─────────────
create or replace function create_tournament(
  p_league_id  uuid,
  p_name       text,
  p_player_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tid        uuid;
  v_count      int;
  v_size       int;
  v_rounds     int;
  v_seed_order int[];
  v_next       int[];
  v_len        int;
  v_seeded     uuid[];
  i            int;
  r            int;
  p            int;
  v_p1         uuid;
  v_p2         uuid;
  v_bye        record;
  v_next_pos   int;
begin
  if not is_league_admin(p_league_id) then
    raise exception 'Only league admins can create tournaments';
  end if;

  v_count := coalesce(array_length(p_player_ids, 1), 0);
  if v_count < 2 then
    raise exception 'A tournament needs at least 2 players';
  end if;

  -- Seed players by current league ELO (1 = highest)
  select array_agg(user_id order by elo_rating desc)
    into v_seeded
  from league_members
  where league_id = p_league_id
    and status = 'active'
    and user_id = any(p_player_ids);

  if coalesce(array_length(v_seeded, 1), 0) <> v_count then
    raise exception 'All players must be active members of this league';
  end if;

  -- Bracket size = next power of 2
  v_size := 2;
  while v_size < v_count loop
    v_size := v_size * 2;
  end loop;
  v_rounds := (ln(v_size) / ln(2))::int;

  -- Standard seeding order, e.g. size 8 -> [1,8,4,5,2,7,3,6]
  v_seed_order := array[1, 2];
  v_len := 2;
  while v_len < v_size loop
    v_next := '{}';
    for i in 1..v_len loop
      v_next := v_next || v_seed_order[i] || (2 * v_len + 1 - v_seed_order[i]);
    end loop;
    v_seed_order := v_next;
    v_len := v_len * 2;
  end loop;

  insert into tournaments (league_id, name, created_by)
  values (p_league_id, p_name, auth.uid())
  returning id into v_tid;

  for i in 1..v_count loop
    insert into tournament_players (tournament_id, user_id, seed)
    values (v_tid, v_seeded[i], i);
  end loop;

  -- Round 1 with players placed; later rounds empty
  for p in 1..(v_size / 2) loop
    v_p1 := case when v_seed_order[2 * p - 1] <= v_count then v_seeded[v_seed_order[2 * p - 1]] else null end;
    v_p2 := case when v_seed_order[2 * p]     <= v_count then v_seeded[v_seed_order[2 * p]]     else null end;
    insert into tournament_matches (tournament_id, round, position, player1_id, player2_id, status)
    values (v_tid, 1, p, v_p1, v_p2,
            case when v_p1 is not null and v_p2 is not null then 'ready'
                 else 'bye' end);
  end loop;

  for r in 2..v_rounds loop
    for p in 1..(v_size / power(2, r)::int) loop
      insert into tournament_matches (tournament_id, round, position, status)
      values (v_tid, r, p, 'pending');
    end loop;
  end loop;

  -- Auto-advance byes out of round 1
  for v_bye in
    select * from tournament_matches
    where tournament_id = v_tid and round = 1 and status = 'bye'
  loop
    update tournament_matches
       set winner_id = coalesce(v_bye.player1_id, v_bye.player2_id)
     where id = v_bye.id;

    if v_rounds >= 2 then
      v_next_pos := ceil(v_bye.position / 2.0);
      if v_bye.position % 2 = 1 then
        update tournament_matches set player1_id = coalesce(v_bye.player1_id, v_bye.player2_id)
         where tournament_id = v_tid and round = 2 and position = v_next_pos;
      else
        update tournament_matches set player2_id = coalesce(v_bye.player1_id, v_bye.player2_id)
         where tournament_id = v_tid and round = 2 and position = v_next_pos;
      end if;
      update tournament_matches set status = 'ready'
       where tournament_id = v_tid and round = 2 and position = v_next_pos
         and player1_id is not null and player2_id is not null;
    end if;
  end loop;

  return v_tid;
end;
$$;

grant execute on function create_tournament(uuid, text, uuid[]) to authenticated;

-- ── report_tournament_match: record score, feed ELO, advance winner ──────────
create or replace function report_tournament_match(
  p_tm_id  uuid,
  p_score1 int,
  p_score2 int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tm        tournament_matches%rowtype;
  v_t         tournaments%rowtype;
  v_winner    uuid;
  v_match_id  uuid;
  v_elo1      int;
  v_elo2      int;
  v_next_pos  int;
  v_max_round int;
begin
  select * into v_tm from tournament_matches where id = p_tm_id;
  if not found then raise exception 'Tournament match not found'; end if;
  if v_tm.status <> 'ready' then raise exception 'Match is not ready for a score'; end if;

  select * into v_t from tournaments where id = v_tm.tournament_id;
  if v_t.status <> 'active' then raise exception 'Tournament is not active'; end if;

  if not exists (
    select 1 from league_members
    where league_id = v_t.league_id
      and user_id = auth.uid()
      and role in ('head_admin', 'admin', 'officiator')
      and status = 'active'
  ) then
    raise exception 'Only admins or officiators can report tournament scores';
  end if;

  if p_score1 is null or p_score2 is null or p_score1 = p_score2 then
    raise exception 'Scores must be provided and cannot be tied';
  end if;

  v_winner := case when p_score1 > p_score2 then v_tm.player1_id else v_tm.player2_id end;

  -- Create a real match so ELO updates flow through the normal engine
  select elo_rating into v_elo1 from league_members
   where league_id = v_t.league_id and user_id = v_tm.player1_id;
  select elo_rating into v_elo2 from league_members
   where league_id = v_t.league_id and user_id = v_tm.player2_id;

  insert into matches (league_id, format, status, created_by, max_points,
                       team1_score, team2_score, completed_at, notes)
  values (v_t.league_id, 'singles', 'completed', auth.uid(),
          greatest(11, p_score1, p_score2),
          p_score1, p_score2, now(), v_t.name || ' — round ' || v_tm.round)
  returning id into v_match_id;

  insert into match_players (match_id, user_id, team, elo_before) values
    (v_match_id, v_tm.player1_id, 1, coalesce(v_elo1, 1000)),
    (v_match_id, v_tm.player2_id, 2, coalesce(v_elo2, 1000));

  perform process_match_result(v_match_id);

  update tournament_matches
     set status = 'completed', winner_id = v_winner,
         score1 = p_score1, score2 = p_score2, match_id = v_match_id
   where id = p_tm_id;

  -- Advance the winner, or finish the tournament
  select max(round) into v_max_round from tournament_matches where tournament_id = v_t.id;

  if v_tm.round = v_max_round then
    update tournaments
       set status = 'completed', winner_id = v_winner, completed_at = now()
     where id = v_t.id;
  else
    v_next_pos := ceil(v_tm.position / 2.0);
    if v_tm.position % 2 = 1 then
      update tournament_matches set player1_id = v_winner
       where tournament_id = v_t.id and round = v_tm.round + 1 and position = v_next_pos;
    else
      update tournament_matches set player2_id = v_winner
       where tournament_id = v_t.id and round = v_tm.round + 1 and position = v_next_pos;
    end if;
    update tournament_matches set status = 'ready'
     where tournament_id = v_t.id and round = v_tm.round + 1 and position = v_next_pos
       and player1_id is not null and player2_id is not null;
  end if;
end;
$$;

grant execute on function report_tournament_match(uuid, int, int) to authenticated;

-- ── get_tournament_public: spectator access by share code (no auth) ──────────
create or replace function get_tournament_public(p_share_code text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'tournament', (
      select json_build_object(
        'id', t.id, 'name', t.name, 'status', t.status,
        'created_at', t.created_at, 'completed_at', t.completed_at,
        'winner_id', t.winner_id,
        'league_name', (select name from leagues where id = t.league_id)
      )
      from tournaments t where t.share_code = p_share_code
    ),
    'players', (
      select coalesce(json_agg(json_build_object(
        'user_id', tp.user_id, 'seed', tp.seed,
        'display_name', pr.display_name,
        'avatar_color', pr.avatar_color, 'avatar_url', pr.avatar_url
      ) order by tp.seed), '[]'::json)
      from tournament_players tp
      join profiles pr on pr.id = tp.user_id
      where tp.tournament_id = (select id from tournaments where share_code = p_share_code)
    ),
    'matches', (
      select coalesce(json_agg(json_build_object(
        'id', tm.id, 'round', tm.round, 'position', tm.position,
        'player1_id', tm.player1_id, 'player2_id', tm.player2_id,
        'winner_id', tm.winner_id, 'score1', tm.score1, 'score2', tm.score2,
        'status', tm.status
      ) order by tm.round, tm.position), '[]'::json)
      from tournament_matches tm
      where tm.tournament_id = (select id from tournaments where share_code = p_share_code)
    )
  );
$$;

grant execute on function get_tournament_public(text) to anon, authenticated;
