-- One-tap check-in for signed-in users: no need to retype your name when you
-- already have an account. Joins as a member (user_id set, name + avatar +
-- gender pulled from your profile). Idempotent — re-attaches if already in.
create or replace function join_open_play_member(p_share_code text, p_skill_level int, p_gender text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_s play_sessions%rowtype; v_uid uuid := auth.uid();
  v_name text; v_color text; v_pgender text; v_gender text;
  v_order int; v_id uuid; v_existing uuid; v_status text;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  select * into v_s from play_sessions where share_code = p_share_code;
  if not found then raise exception 'Session not found'; end if;
  if v_s.status <> 'active' then raise exception 'This session has ended'; end if;
  if not v_s.allow_self_join then raise exception 'Self check-in is turned off for this session'; end if;

  -- already in this session? return it (revive a checked-out one)
  select id, status into v_existing, v_status from session_players
  where session_id = v_s.id and user_id = v_uid
  order by (status <> 'left') desc limit 1;
  if v_existing is not null then
    if v_status = 'left' then
      select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
      update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = v_existing;
    end if;
    return v_existing;
  end if;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), display_name),
         avatar_color,
         case gender when 'male' then 'm' when 'female' then 'f' else null end
    into v_name, v_color, v_pgender
  from profiles where id = v_uid;

  v_gender := coalesce(case when p_gender in ('m', 'f') then p_gender else null end, v_pgender);

  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
  insert into session_players (session_id, user_id, display_name, avatar_color, skill, skill_level, gender, queue_order)
  values (v_s.id, v_uid, coalesce(v_name, 'Player'), coalesce(v_color, '#16a34a'), 1000,
          case when p_skill_level between 1 and 5 then p_skill_level else null end,
          v_gender, v_order)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function join_open_play_member(text, int, text) to authenticated;
