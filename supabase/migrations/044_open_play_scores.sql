-- Open Play score entry: record the actual game score (not just a winner).
-- Rated all-member games now feed margin-aware ELO with the real score, and
-- per-player points drive the live session standings (and Americano/Mexicano).

alter table session_games
  add column if not exists team1_score int,
  add column if not exists team2_score int;

-- Scored completion (overloads the winner-only version by arity).
create or replace function complete_session_game(p_game_id uuid, p_t1 int, p_t2 int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_g session_games%rowtype; v_s play_sessions%rowtype;
  v_all_ids uuid[]; v_win_ids uuid[]; v_lose_ids uuid[]; v_winner int;
  v_all_members boolean; v_match_id uuid; v_uid uuid; v_elo int; v_pid uuid; v_order int; v_max int;
begin
  select * into v_g from session_games where id = p_game_id;
  if not found then raise exception 'Game not found'; end if;
  select * into v_s from play_sessions where id = v_g.session_id;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if v_g.status = 'completed' then raise exception 'Game already recorded'; end if;
  if p_t1 = p_t2 then raise exception 'Scores can''t be tied'; end if;

  v_winner   := case when p_t1 > p_t2 then 1 else 2 end;
  v_win_ids  := case when v_winner = 1 then v_g.team1_ids else v_g.team2_ids end;
  v_lose_ids := case when v_winner = 1 then v_g.team2_ids else v_g.team1_ids end;
  v_all_ids  := v_g.team1_ids || v_g.team2_ids;
  v_max      := greatest(p_t1, p_t2, 11);

  v_all_members := v_s.rated
    and (select count(*) from session_players where id = any(v_all_ids) and user_id is null) = 0;

  if v_all_members then
    insert into matches (league_id, format, status, created_by, max_points,
                         team1_score, team2_score, completed_at, notes)
    values (v_s.league_id, v_s.format::match_format, 'completed', auth.uid(), v_max,
            p_t1, p_t2, now(), 'Open play — ' || v_s.name)
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
    update session_players set status = 'queued', queue_order = v_order, queued_since = now()
      where id = v_pid and status = 'playing';
  end loop;

  update session_games set status = 'completed', winner_team = v_winner,
         team1_score = p_t1, team2_score = p_t2, match_id = v_match_id, completed_at = now()
  where id = p_game_id;
end;
$$;
grant execute on function complete_session_game(uuid, int, int) to authenticated;
