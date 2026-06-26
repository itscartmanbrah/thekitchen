-- Prevent duplicate guests: if someone rescans the QR / reopens the link (e.g.
-- in a fresh in-app browser where localStorage was lost) and enters the same
-- name, re-attach them to their existing record instead of creating a second
-- one. Only matches active GUEST rows (user_id is null, not checked out) so it
-- can never hijack a real member's player.
create or replace function join_open_play(p_share_code text, p_guest_name text, p_skill_level int, p_gender text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_s play_sessions%rowtype; v_order int; v_id uuid; v_name text; v_existing uuid; v_existing_status text;
begin
  select * into v_s from play_sessions where share_code = p_share_code;
  if not found then raise exception 'Session not found'; end if;
  if v_s.status <> 'active' then raise exception 'This session has ended'; end if;
  if not v_s.allow_self_join then raise exception 'Self check-in is turned off for this session'; end if;

  v_name := trim(coalesce(p_guest_name, ''));
  if v_name = '' then raise exception 'Please enter your name'; end if;
  if length(v_name) > 40 then v_name := substr(v_name, 1, 40); end if;

  -- Same name already in this session? Re-attach to that guest instead of making
  -- a duplicate. Prefer an active record; revive a checked-out one if that's all
  -- there is (so their stats resume).
  select id, status into v_existing, v_existing_status from session_players
  where session_id = v_s.id and user_id is null
    and lower(display_name) = lower(v_name)
  order by (status <> 'left') desc, queue_order
  limit 1;
  if v_existing is not null then
    if v_existing_status = 'left' then
      select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
      update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = v_existing;
    end if;
    return v_existing;
  end if;

  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
  insert into session_players (session_id, guest_name, display_name, avatar_color, skill, skill_level, gender, queue_order)
  values (v_s.id, v_name, v_name, '#64748b', 1000,
          case when p_skill_level between 1 and 5 then p_skill_level else null end,
          case when p_gender in ('m', 'f') then p_gender else null end,
          v_order)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function join_open_play(text, text, int, text) to anon, authenticated;
