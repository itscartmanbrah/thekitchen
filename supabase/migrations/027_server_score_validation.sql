-- Server-side pickleball score validation for tournament reporting.
-- Mirrors the client-side validatePickleballScore: no ties, winner reaches the
-- target, win by at least 2, and extended play ends exactly 2 apart.
-- This makes the rules enforceable even against direct API calls.

create or replace function assert_valid_pickleball_score(
  p_s1 int,
  p_s2 int,
  p_max_points int default 11
) returns void
language plpgsql
immutable
as $$
declare
  v_winner int;
  v_loser  int;
  v_diff   int;
begin
  if p_s1 is null or p_s2 is null or p_s1 < 0 or p_s2 < 0 then
    raise exception 'Enter a valid score for each side';
  end if;
  if p_s1 = p_s2 then
    raise exception 'Ties are not allowed in pickleball';
  end if;

  v_winner := greatest(p_s1, p_s2);
  v_loser  := least(p_s1, p_s2);
  v_diff   := v_winner - v_loser;

  if v_winner < p_max_points then
    raise exception 'The winning score must reach at least %', p_max_points;
  end if;
  if v_diff < 2 then
    raise exception 'You must win by at least 2 points (score was %–%)', v_winner, v_loser;
  end if;
  if v_winner > p_max_points and v_diff <> 2 then
    raise exception 'Past %, the game ends the moment someone leads by exactly 2 — the loser must have %',
      p_max_points, v_winner - 2;
  end if;
end;
$$;

-- ── report_division_match: add validation ───────────────────────────────────
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

  perform assert_valid_pickleball_score(p_score1, p_score2, 11);

  v_winner := case when p_score1 > p_score2 then v_tm.entry1_id else v_tm.entry2_id end;
  select * into v_e1 from division_entries where id = v_tm.entry1_id;
  select * into v_e2 from division_entries where id = v_tm.entry2_id;

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

  if not exists (
    select 1 from tournament_divisions
    where tournament_id = v_t.id and status <> 'completed'
  ) then
    update tournaments set status = 'completed', completed_at = now() where id = v_t.id;
  end if;
end;
$$;

grant execute on function report_division_match(uuid, int, int) to authenticated;

-- ── report_tournament_match (legacy v1): add validation ─────────────────────
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
    where league_id = v_t.league_id and user_id = auth.uid()
      and role in ('head_admin', 'admin', 'officiator') and status = 'active'
  ) then
    raise exception 'Only admins or officiators can report tournament scores';
  end if;

  perform assert_valid_pickleball_score(p_score1, p_score2, 11);

  v_winner := case when p_score1 > p_score2 then v_tm.player1_id else v_tm.player2_id end;

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

  select max(round) into v_max_round from tournament_matches
   where tournament_id = v_t.id and division_id is null;

  if v_tm.round = v_max_round then
    update tournaments
       set status = 'completed', winner_id = v_winner, completed_at = now()
     where id = v_t.id;
  else
    v_next_pos := ceil(v_tm.position / 2.0);
    if v_tm.position % 2 = 1 then
      update tournament_matches set player1_id = v_winner
       where tournament_id = v_t.id and division_id is null and round = v_tm.round + 1 and position = v_next_pos;
    else
      update tournament_matches set player2_id = v_winner
       where tournament_id = v_t.id and division_id is null and round = v_tm.round + 1 and position = v_next_pos;
    end if;
    update tournament_matches set status = 'ready'
     where tournament_id = v_t.id and division_id is null and round = v_tm.round + 1 and position = v_next_pos
       and player1_id is not null and player2_id is not null;
  end if;
end;
$$;

grant execute on function report_tournament_match(uuid, int, int) to authenticated;
