-- Board View payload: add per-court start times (timers) and the On Deck queue
-- (staged groups) to the public open-play feed.

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
