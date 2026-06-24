-- Court-independent rounds: round formats (King/Americano/Mexicano) build a full
-- round of ranked groups (players ÷ per-game), independent of how many courts
-- exist. Groups stage in "On Deck" (editable) and feed onto courts as they free
-- — so King works even on a single court (games played in sequence by rank).
--
--   rank     = ladder position of a group within its round (1 = top/Kings)
--   round_no = which round a group belongs to

alter table session_games
  add column if not exists rank     int,
  add column if not exists round_no int;

-- Extend stage_session_group with optional rank/round (drop-in still calls it
-- with 3 args; PostgREST fills the rest from defaults).
drop function if exists stage_session_group(uuid, uuid[], uuid[]);
create or replace function stage_session_group(
  p_session_id uuid, p_team1 uuid[], p_team2 uuid[], p_rank int default null, p_round int default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_id uuid; v_all uuid[];
begin
  select * into v_s from play_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_session_organizer(v_s.league_id) then raise exception 'Not authorised'; end if;
  if open_play_is_over(p_session_id) then raise exception 'Session has ended'; end if;

  v_all := coalesce(p_team1, '{}') || coalesce(p_team2, '{}');
  if exists (select 1 from session_players where id = any(v_all) and (session_id <> p_session_id or status not in ('queued','resting'))) then
    raise exception 'One or more players are not available';
  end if;

  insert into session_games (session_id, court_number, team1_ids, team2_ids, status, rank, round_no)
  values (p_session_id, null, coalesce(p_team1,'{}'), coalesce(p_team2,'{}'), 'staged', p_rank, p_round)
  returning id into v_id;
  update session_players set status = 'staged' where id = any(v_all);
  return v_id;
end;
$$;
grant execute on function stage_session_group(uuid, uuid[], uuid[], int, int) to authenticated;
