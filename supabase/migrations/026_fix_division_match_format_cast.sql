-- Fix: matches.format is the enum match_format, but report_division_match
-- passed v_d.format (text), which Postgres won't implicitly cast from a
-- variable. Add an explicit cast.

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
