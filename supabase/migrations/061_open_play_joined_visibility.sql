-- See & manage Open Play sessions you JOINED (not just hosted), from your
-- account — and show up under your real name once you log in.

-- 1) Claiming a guest now also renames it to the account's name + avatar, so the
--    player shows up as the real person in the session / standings.
create or replace function claim_open_play_guests(p_player_ids uuid[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_count int := 0; v_pid uuid; v_sid uuid; v_name text; v_color text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), display_name), avatar_color
    into v_name, v_color from profiles where id = v_uid;
  foreach v_pid in array coalesce(p_player_ids, '{}') loop
    select session_id into v_sid from session_players where id = v_pid and user_id is null;
    if v_sid is null then continue; end if;
    if exists (select 1 from session_players where session_id = v_sid and user_id = v_uid) then continue; end if;
    update session_players
      set user_id = v_uid,
          display_name = coalesce(v_name, display_name),
          avatar_color = coalesce(v_color, avatar_color),
          guest_name = null
    where id = v_pid and user_id is null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function claim_open_play_guests(uuid[]) to authenticated;

-- 2) Active Open Play sessions the signed-in user is a PLAYER in (joined, not
--    hosting — those are listed elsewhere). For the dashboard / My Open Play.
create or replace function get_my_active_open_play()
returns json
language sql security definer stable set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
    'session_id', s.id, 'name', s.name, 'match_mode', s.match_mode, 'format', s.format,
    'court_count', s.court_count, 'share_code', s.share_code, 'started_at', s.started_at,
    'league_name', (select name from leagues where id = s.league_id),
    'my_status', sp.status
  ) order by s.started_at desc), '[]'::json)
  from session_players sp
  join play_sessions s on s.id = sp.session_id
  where sp.user_id = auth.uid()
    and sp.status <> 'left'
    and s.ended_at is null
    and (s.ends_at is null or s.ends_at > now())
    and s.created_by <> auth.uid();
$$;
grant execute on function get_my_active_open_play() to authenticated;

-- 3) The signed-in user's player id in a given session (by account), so the
--    public session page can recognise a logged-in participant — not just the
--    device's localStorage.
create or replace function my_open_play_player(p_share_code text)
returns uuid
language sql security definer stable set search_path = public
as $$
  select sp.id
  from session_players sp
  join play_sessions s on s.id = sp.session_id
  where s.share_code = p_share_code and sp.user_id = auth.uid() and sp.status <> 'left'
  limit 1;
$$;
grant execute on function my_open_play_player(text) to authenticated;
