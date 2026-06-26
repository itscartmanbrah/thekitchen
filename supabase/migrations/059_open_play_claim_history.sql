-- Guest → account linking + personal Open Play history.

-- Claim guest player rows (joined via QR/share link) for the signed-in user.
-- Only links rows that are still guests (user_id is null) and skips any session
-- where the user is already a player — so it can't hijack or duplicate.
create or replace function claim_open_play_guests(p_player_ids uuid[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_count int := 0; v_pid uuid; v_sid uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  foreach v_pid in array coalesce(p_player_ids, '{}') loop
    select session_id into v_sid from session_players where id = v_pid and user_id is null;
    if v_sid is null then continue; end if;
    if exists (select 1 from session_players where session_id = v_sid and user_id = v_uid) then continue; end if;
    update session_players set user_id = v_uid where id = v_pid and user_id is null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function claim_open_play_guests(uuid[]) to authenticated;

-- Every Open Play session the signed-in user has played in (league OR
-- standalone), newest first, with their record + the games they played.
create or replace function get_my_open_play_history()
returns json
language sql security definer stable set search_path = public
as $$
  select coalesce(json_agg(j order by ord desc nulls last), '[]'::json)
  from (
    select
      s.started_at as ord,
      json_build_object(
        'session_id', s.id,
        'name', s.name,
        'match_mode', s.match_mode,
        'format', s.format,
        'started_at', s.started_at,
        'ended_at', s.ended_at,
        'league_name', (select name from leagues where id = s.league_id),
        'wins', sp.wins, 'losses', sp.losses, 'games', sp.games,
        'points', coalesce((
          select sum(case when sp.id = any(g.team1_ids) then g.team1_score else g.team2_score end)
          from session_games g
          where g.session_id = s.id and g.status = 'completed'
            and (sp.id = any(g.team1_ids) or sp.id = any(g.team2_ids))
        ), 0),
        'games_detail', (
          select coalesce(json_agg(json_build_object(
            'mine',  case when sp.id = any(g.team1_ids) then g.team1_score else g.team2_score end,
            'theirs', case when sp.id = any(g.team1_ids) then g.team2_score else g.team1_score end,
            'won', (case when sp.id = any(g.team1_ids) then 1 else 2 end) = g.winner_team,
            'partner', (select string_agg(p2.display_name, ' & ')
                        from session_players p2
                        where p2.id = any(case when sp.id = any(g.team1_ids) then g.team1_ids else g.team2_ids end)
                          and p2.id <> sp.id),
            'opponents', (select string_agg(p3.display_name, ' & ')
                          from session_players p3
                          where p3.id = any(case when sp.id = any(g.team1_ids) then g.team2_ids else g.team1_ids end)),
            'at', g.completed_at
          ) order by g.completed_at desc), '[]'::json)
          from session_games g
          where g.session_id = s.id and g.status = 'completed'
            and (sp.id = any(g.team1_ids) or sp.id = any(g.team2_ids))
        )
      ) as j
    from session_players sp
    join play_sessions s on s.id = sp.session_id
    where sp.user_id = auth.uid()
  ) t;
$$;
grant execute on function get_my_open_play_history() to authenticated;
