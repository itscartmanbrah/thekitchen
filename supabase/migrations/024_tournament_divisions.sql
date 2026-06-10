-- Tournament divisions (tiers): Open Men, Novice Women, 35+ Mixed, etc.
--
-- A tournament becomes an event containing divisions. Each division has its
-- own eligibility rules (gender / age / rating), format (singles, doubles,
-- mixed doubles), bracket type (single elimination or round robin),
-- registration phase, entries (player or player+partner teams), and bracket.
--
-- Legacy v1 tournaments (no divisions) keep working: their matches have
-- division_id null and the original unique constraint is preserved for them.

-- ── Gender on profiles (needed for Men/Women/Mixed divisions) ───────────────
alter table profiles
  add column if not exists gender text check (gender in ('male', 'female'));

-- ── Tables ──────────────────────────────────────────────────────────────────
create table tournament_divisions (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  name            text not null,
  format          text not null check (format in ('singles', 'doubles', 'mixed_doubles')),
  bracket_type    text not null default 'single_elim' check (bracket_type in ('single_elim', 'round_robin')),
  gender          text not null default 'open' check (gender in ('open', 'men', 'women', 'mixed')),
  min_age         int,
  max_age         int,
  min_rating      int,     -- ELO bounds (UI shows DUPR equivalents)
  max_rating      int,
  status          text not null default 'registration' check (status in ('registration', 'active', 'completed')),
  winner_entry_id uuid,
  created_at      timestamptz not null default now()
);

create table division_entries (
  id          uuid primary key default gen_random_uuid(),
  division_id uuid not null references tournament_divisions(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  partner_id  uuid references auth.users(id),
  seed        int,
  created_at  timestamptz not null default now(),
  unique (division_id, user_id)
);

alter table tournament_divisions
  add constraint tournament_divisions_winner_fk
  foreign key (winner_entry_id) references division_entries(id);

-- Extend tournament_matches for division/entry-based play
alter table tournament_matches
  add column division_id     uuid references tournament_divisions(id) on delete cascade,
  add column entry1_id       uuid references division_entries(id),
  add column entry2_id       uuid references division_entries(id),
  add column winner_entry_id uuid references division_entries(id);

-- Round/position uniqueness is per division for new matches, per tournament for legacy
alter table tournament_matches drop constraint if exists tournament_matches_tournament_id_round_position_key;
create unique index uq_tm_legacy on tournament_matches(tournament_id, round, position) where division_id is null;
create unique index uq_tm_division on tournament_matches(division_id, round, position) where division_id is not null;

create index idx_division_entries_div on division_entries(division_id);
create index idx_tournament_divisions_t on tournament_divisions(tournament_id);

alter table tournament_divisions enable row level security;
alter table division_entries enable row level security;

create policy "League members can view divisions"
  on tournament_divisions for select using (
    tournament_id in (select id from tournaments where league_id in (select auth_user_league_ids()))
  );
create policy "League members can view division entries"
  on division_entries for select using (
    division_id in (
      select d.id from tournament_divisions d
      join tournaments t on t.id = d.tournament_id
      where t.league_id in (select auth_user_league_ids())
    )
  );
-- Writes via security definer RPCs only.

-- ── Eligibility helper ───────────────────────────────────────────────────────
-- Returns null when eligible, otherwise a human-readable reason.
create or replace function division_eligibility_reason(p_division_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_d      tournament_divisions%rowtype;
  v_t      tournaments%rowtype;
  v_member league_members%rowtype;
  v_gender text;
  v_bday   date;
  v_age    int;
begin
  select * into v_d from tournament_divisions where id = p_division_id;
  if not found then return 'Division not found'; end if;
  select * into v_t from tournaments where id = v_d.tournament_id;

  select * into v_member from league_members
   where league_id = v_t.league_id and user_id = p_user_id and status = 'active';
  if not found then return 'Not an active member of this league'; end if;

  select gender, birthday into v_gender, v_bday from profiles where id = p_user_id;

  if v_d.gender = 'men' and (v_gender is null or v_gender <> 'male') then
    return 'This division is for men only' || case when v_gender is null then ' — set your gender in Profile settings' else '' end;
  end if;
  if v_d.gender = 'women' and (v_gender is null or v_gender <> 'female') then
    return 'This division is for women only' || case when v_gender is null then ' — set your gender in Profile settings' else '' end;
  end if;
  if v_d.gender = 'mixed' and v_gender is null then
    return 'Mixed divisions need your gender set — update it in Profile settings';
  end if;

  if v_d.min_age is not null or v_d.max_age is not null then
    if v_bday is null then return 'This division has an age limit — add your date of birth in Profile settings'; end if;
    v_age := date_part('year', age(v_bday))::int;
    if v_d.min_age is not null and v_age < v_d.min_age then
      return format('This division is for players %s and older', v_d.min_age);
    end if;
    if v_d.max_age is not null and v_age > v_d.max_age then
      return format('This division is for players %s and under', v_d.max_age);
    end if;
  end if;

  if v_d.min_rating is not null and v_member.elo_rating < v_d.min_rating then
    return 'Your rating is below the minimum for this division';
  end if;
  if v_d.max_rating is not null and v_member.elo_rating > v_d.max_rating then
    return 'Your rating is above the limit for this division';
  end if;

  return null;
end;
$$;

grant execute on function division_eligibility_reason(uuid, uuid) to authenticated;

-- ── create_tournament_with_divisions ─────────────────────────────────────────
create or replace function create_tournament_with_divisions(
  p_league_id uuid,
  p_name      text,
  p_divisions jsonb   -- [{name, format, bracket_type, gender, min_age, max_age, min_rating, max_rating}]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tid uuid;
  v_div jsonb;
begin
  if not is_league_admin(p_league_id) then
    raise exception 'Only league admins can create tournaments';
  end if;
  if p_divisions is null or jsonb_array_length(p_divisions) = 0 then
    raise exception 'At least one division is required';
  end if;

  insert into tournaments (league_id, name, created_by)
  values (p_league_id, p_name, auth.uid())
  returning id into v_tid;

  for v_div in select * from jsonb_array_elements(p_divisions) loop
    insert into tournament_divisions
      (tournament_id, name, format, bracket_type, gender, min_age, max_age, min_rating, max_rating)
    values (
      v_tid,
      v_div->>'name',
      v_div->>'format',
      coalesce(v_div->>'bracket_type', 'single_elim'),
      coalesce(v_div->>'gender', 'open'),
      (v_div->>'min_age')::int,
      (v_div->>'max_age')::int,
      (v_div->>'min_rating')::int,
      (v_div->>'max_rating')::int
    );
  end loop;

  return v_tid;
end;
$$;

grant execute on function create_tournament_with_divisions(uuid, text, jsonb) to authenticated;

-- ── register_for_division ────────────────────────────────────────────────────
create or replace function register_for_division(
  p_division_id uuid,
  p_partner_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d        tournament_divisions%rowtype;
  v_reason   text;
  v_g1       text;
  v_g2       text;
  v_entry_id uuid;
  v_t        tournaments%rowtype;
begin
  select * into v_d from tournament_divisions where id = p_division_id;
  if not found then raise exception 'Division not found'; end if;
  if v_d.status <> 'registration' then raise exception 'Registration is closed for this division'; end if;
  select * into v_t from tournaments where id = v_d.tournament_id;

  if v_d.format = 'singles' then
    if p_partner_id is not null then raise exception 'Singles divisions have no partners'; end if;
  else
    if p_partner_id is null then raise exception 'This division needs a partner — pick one to register'; end if;
    if p_partner_id = auth.uid() then raise exception 'You cannot partner with yourself'; end if;
  end if;

  v_reason := division_eligibility_reason(p_division_id, auth.uid());
  if v_reason is not null then raise exception '%', v_reason; end if;

  if p_partner_id is not null then
    v_reason := division_eligibility_reason(p_division_id, p_partner_id);
    if v_reason is not null then raise exception 'Partner: %', v_reason; end if;

    if v_d.gender = 'mixed' then
      select gender into v_g1 from profiles where id = auth.uid();
      select gender into v_g2 from profiles where id = p_partner_id;
      if v_g1 = v_g2 then raise exception 'Mixed teams need one man and one woman'; end if;
    end if;
  end if;

  -- No double-entry (as player or partner)
  if exists (
    select 1 from division_entries
    where division_id = p_division_id
      and (user_id in (auth.uid(), p_partner_id) or partner_id in (auth.uid(), p_partner_id))
  ) then
    raise exception 'You or your partner are already entered in this division';
  end if;

  insert into division_entries (division_id, user_id, partner_id)
  values (p_division_id, auth.uid(), p_partner_id)
  returning id into v_entry_id;

  -- Tell the partner
  if p_partner_id is not null then
    insert into notifications (user_id, type, title, body, data)
    select p_partner_id, 'tournament_entry', '🏆 You have been entered in a tournament',
           pr.display_name || ' registered you as their partner in "' || v_d.name || '" (' || v_t.name || ').',
           jsonb_build_object('tournament_id', v_t.id, 'league_id', v_t.league_id)
    from profiles pr where pr.id = auth.uid();
  end if;

  return v_entry_id;
end;
$$;

grant execute on function register_for_division(uuid, uuid) to authenticated;

-- ── withdraw_from_division ───────────────────────────────────────────────────
create or replace function withdraw_from_division(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e division_entries%rowtype;
  v_d tournament_divisions%rowtype;
  v_t tournaments%rowtype;
begin
  select * into v_e from division_entries where id = p_entry_id;
  if not found then raise exception 'Entry not found'; end if;
  select * into v_d from tournament_divisions where id = v_e.division_id;
  if v_d.status <> 'registration' then raise exception 'The bracket has already been generated'; end if;
  select * into v_t from tournaments where id = v_d.tournament_id;

  if auth.uid() not in (v_e.user_id, v_e.partner_id) and not is_league_admin(v_t.league_id) then
    raise exception 'Not authorised to withdraw this entry';
  end if;

  delete from division_entries where id = p_entry_id;
end;
$$;

grant execute on function withdraw_from_division(uuid) to authenticated;

-- ── start_division: seed entries, generate bracket or round robin ────────────
create or replace function start_division(p_division_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d          tournament_divisions%rowtype;
  v_t          tournaments%rowtype;
  v_count      int;
  v_entries    uuid[];
  v_size       int;
  v_rounds     int;
  v_seed_order int[];
  v_next       int[];
  v_len        int;
  i            int;
  j            int;
  r            int;
  p            int;
  v_e1         uuid;
  v_e2         uuid;
  v_bye        record;
  v_next_pos   int;
  v_pos        int;
begin
  select * into v_d from tournament_divisions where id = p_division_id;
  if not found then raise exception 'Division not found'; end if;
  if v_d.status <> 'registration' then raise exception 'Division already started'; end if;
  select * into v_t from tournaments where id = v_d.tournament_id;
  if not is_league_admin(v_t.league_id) then raise exception 'Only league admins can start a division'; end if;

  -- Seed by relevant format rating (avg over team), best first
  select array_agg(e.id order by rating desc, e.created_at)
    into v_entries
  from (
    select de.id, de.created_at,
      (
        select avg(case
          when v_d.format = 'singles' then coalesce(lm.singles_elo, lm.elo_rating)
          else coalesce(lm.doubles_elo, lm.elo_rating)
        end)
        from league_members lm
        where lm.league_id = v_t.league_id
          and lm.user_id in (de.user_id, de.partner_id)
      ) as rating
    from division_entries de
    where de.division_id = p_division_id
  ) e;

  v_count := coalesce(array_length(v_entries, 1), 0);
  if v_count < 2 then raise exception 'A division needs at least 2 entries to start'; end if;

  for i in 1..v_count loop
    update division_entries set seed = i where id = v_entries[i];
  end loop;

  if v_d.bracket_type = 'round_robin' then
    -- Everyone plays everyone once
    v_pos := 0;
    for i in 1..(v_count - 1) loop
      for j in (i + 1)..v_count loop
        v_pos := v_pos + 1;
        insert into tournament_matches
          (tournament_id, division_id, round, position, entry1_id, entry2_id, status)
        values (v_t.id, p_division_id, 1, v_pos, v_entries[i], v_entries[j], 'ready');
      end loop;
    end loop;
  else
    -- Single elimination with byes
    v_size := 2;
    while v_size < v_count loop v_size := v_size * 2; end loop;
    v_rounds := (ln(v_size) / ln(2))::int;

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

    for p in 1..(v_size / 2) loop
      v_e1 := case when v_seed_order[2 * p - 1] <= v_count then v_entries[v_seed_order[2 * p - 1]] else null end;
      v_e2 := case when v_seed_order[2 * p]     <= v_count then v_entries[v_seed_order[2 * p]]     else null end;
      insert into tournament_matches
        (tournament_id, division_id, round, position, entry1_id, entry2_id, status)
      values (v_t.id, p_division_id, 1, p, v_e1, v_e2,
              case when v_e1 is not null and v_e2 is not null then 'ready' else 'bye' end);
    end loop;

    for r in 2..v_rounds loop
      for p in 1..(v_size / power(2, r)::int) loop
        insert into tournament_matches (tournament_id, division_id, round, position, status)
        values (v_t.id, p_division_id, r, p, 'pending');
      end loop;
    end loop;

    -- Auto-advance byes
    for v_bye in
      select * from tournament_matches
      where division_id = p_division_id and round = 1 and status = 'bye'
    loop
      update tournament_matches
         set winner_entry_id = coalesce(v_bye.entry1_id, v_bye.entry2_id)
       where id = v_bye.id;

      if v_rounds >= 2 then
        v_next_pos := ceil(v_bye.position / 2.0);
        if v_bye.position % 2 = 1 then
          update tournament_matches set entry1_id = coalesce(v_bye.entry1_id, v_bye.entry2_id)
           where division_id = p_division_id and round = 2 and position = v_next_pos;
        else
          update tournament_matches set entry2_id = coalesce(v_bye.entry1_id, v_bye.entry2_id)
           where division_id = p_division_id and round = 2 and position = v_next_pos;
        end if;
        update tournament_matches set status = 'ready'
         where division_id = p_division_id and round = 2 and position = v_next_pos
           and entry1_id is not null and entry2_id is not null;
      end if;
    end loop;
  end if;

  update tournament_divisions set status = 'active' where id = p_division_id;
end;
$$;

grant execute on function start_division(uuid) to authenticated;

-- ── report_division_match ────────────────────────────────────────────────────
create or replace function report_division_match(
  p_tm_id  uuid,
  p_score1 int,
  p_score2 int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tm         tournament_matches%rowtype;
  v_d          tournament_divisions%rowtype;
  v_t          tournaments%rowtype;
  v_winner     uuid;
  v_match_id   uuid;
  v_e1         division_entries%rowtype;
  v_e2         division_entries%rowtype;
  v_uid        uuid;
  v_elo        int;
  v_next_pos   int;
  v_max_round  int;
  v_rr_winner  uuid;
begin
  select * into v_tm from tournament_matches where id = p_tm_id;
  if not found then raise exception 'Match not found'; end if;
  if v_tm.division_id is null then raise exception 'Use report_tournament_match for legacy tournaments'; end if;
  if v_tm.status <> 'ready' then raise exception 'Match is not ready for a score'; end if;

  select * into v_d from tournament_divisions where id = v_tm.division_id;
  select * into v_t from tournaments where id = v_d.tournament_id;

  if not exists (
    select 1 from league_members
    where league_id = v_t.league_id and user_id = auth.uid()
      and role in ('head_admin', 'admin', 'officiator') and status = 'active'
  ) then
    raise exception 'Only admins or officiators can report tournament scores';
  end if;

  if p_score1 is null or p_score2 is null or p_score1 = p_score2 then
    raise exception 'Scores must be provided and cannot be tied';
  end if;

  v_winner := case when p_score1 > p_score2 then v_tm.entry1_id else v_tm.entry2_id end;
  select * into v_e1 from division_entries where id = v_tm.entry1_id;
  select * into v_e2 from division_entries where id = v_tm.entry2_id;

  -- Real league match so ELO flows through the normal engine
  insert into matches (league_id, format, status, created_by, max_points,
                       team1_score, team2_score, completed_at, notes)
  values (v_t.league_id, v_d.format::match_format, 'completed', auth.uid(),
          greatest(11, p_score1, p_score2), p_score1, p_score2, now(),
          v_t.name || ' — ' || v_d.name)
  returning id into v_match_id;

  foreach v_uid in array array_remove(array[v_e1.user_id, v_e1.partner_id], null) loop
    select elo_rating into v_elo from league_members where league_id = v_t.league_id and user_id = v_uid;
    insert into match_players (match_id, user_id, team, elo_before)
    values (v_match_id, v_uid, 1, coalesce(v_elo, 1000));
  end loop;
  foreach v_uid in array array_remove(array[v_e2.user_id, v_e2.partner_id], null) loop
    select elo_rating into v_elo from league_members where league_id = v_t.league_id and user_id = v_uid;
    insert into match_players (match_id, user_id, team, elo_before)
    values (v_match_id, v_uid, 2, coalesce(v_elo, 1000));
  end loop;

  perform process_match_result(v_match_id);

  update tournament_matches
     set status = 'completed', winner_entry_id = v_winner,
         score1 = p_score1, score2 = p_score2, match_id = v_match_id
   where id = p_tm_id;

  if v_d.bracket_type = 'round_robin' then
    -- Division completes when every match is reported; winner = most wins,
    -- then best total point difference
    if not exists (
      select 1 from tournament_matches
      where division_id = v_d.id and status in ('ready', 'pending')
    ) then
      select entry into v_rr_winner from (
        select e.id as entry,
          count(*) filter (where tm.winner_entry_id = e.id) as wins,
          sum(case when tm.entry1_id = e.id then tm.score1 - tm.score2
                   when tm.entry2_id = e.id then tm.score2 - tm.score1 else 0 end) as diff
        from division_entries e
        join tournament_matches tm
          on tm.division_id = e.division_id
         and (tm.entry1_id = e.id or tm.entry2_id = e.id)
         and tm.status = 'completed'
        where e.division_id = v_d.id
        group by e.id
        order by wins desc, diff desc
        limit 1
      ) s;
      update tournament_divisions
         set status = 'completed', winner_entry_id = v_rr_winner
       where id = v_d.id;
    end if;
  else
    select max(round) into v_max_round from tournament_matches where division_id = v_d.id;
    if v_tm.round = v_max_round then
      update tournament_divisions
         set status = 'completed', winner_entry_id = v_winner
       where id = v_d.id;
    else
      v_next_pos := ceil(v_tm.position / 2.0);
      if v_tm.position % 2 = 1 then
        update tournament_matches set entry1_id = v_winner
         where division_id = v_d.id and round = v_tm.round + 1 and position = v_next_pos;
      else
        update tournament_matches set entry2_id = v_winner
         where division_id = v_d.id and round = v_tm.round + 1 and position = v_next_pos;
      end if;
      update tournament_matches set status = 'ready'
       where division_id = v_d.id and round = v_tm.round + 1 and position = v_next_pos
         and entry1_id is not null and entry2_id is not null;
    end if;
  end if;

  -- Event completes when no division is left open
  if not exists (
    select 1 from tournament_divisions
    where tournament_id = v_t.id and status <> 'completed'
  ) then
    update tournaments set status = 'completed', completed_at = now() where id = v_t.id;
  end if;
end;
$$;

grant execute on function report_division_match(uuid, int, int) to authenticated;

-- ── Public spectator payload: include divisions ──────────────────────────────
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
        and tm.division_id is null
    ),
    'divisions', (
      select coalesce(json_agg(json_build_object(
        'id', d.id, 'name', d.name, 'format', d.format,
        'bracket_type', d.bracket_type, 'gender', d.gender,
        'status', d.status, 'winner_entry_id', d.winner_entry_id,
        'entries', (
          select coalesce(json_agg(json_build_object(
            'id', e.id, 'seed', e.seed,
            'name', p1.display_name || coalesce(' & ' || p2.display_name, ''),
            'avatar_color', p1.avatar_color, 'avatar_url', p1.avatar_url
          ) order by coalesce(e.seed, 999)), '[]'::json)
          from division_entries e
          join profiles p1 on p1.id = e.user_id
          left join profiles p2 on p2.id = e.partner_id
          where e.division_id = d.id
        ),
        'matches', (
          select coalesce(json_agg(json_build_object(
            'id', tm.id, 'round', tm.round, 'position', tm.position,
            'entry1_id', tm.entry1_id, 'entry2_id', tm.entry2_id,
            'winner_entry_id', tm.winner_entry_id,
            'score1', tm.score1, 'score2', tm.score2, 'status', tm.status
          ) order by tm.round, tm.position), '[]'::json)
          from tournament_matches tm
          where tm.division_id = d.id
        )
      ) order by d.created_at), '[]'::json)
      from tournament_divisions d
      where d.tournament_id = (select id from tournaments where share_code = p_share_code)
    )
  );
$$;

grant execute on function get_tournament_public(text) to anon, authenticated;
