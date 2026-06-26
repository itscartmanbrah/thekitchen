-- Self-service "Check out": let a self-joined player (anon, no account) rest for
-- a few games or come back, from their own phone — mirroring leave_open_play's
-- "knowing your own player id is enough" model.

create or replace function rest_open_play(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from session_players where id = p_player_id;
  if not found then raise exception 'Not found'; end if;
  if v_status = 'playing' then raise exception 'You are on a court right now — finish your game first'; end if;
  if v_status = 'left' then raise exception 'You have already checked out'; end if;
  update session_players set status = 'resting' where id = p_player_id;
end;
$$;
grant execute on function rest_open_play(uuid) to anon, authenticated;

create or replace function backin_open_play(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_sid uuid; v_status text; v_order int;
begin
  select session_id, status into v_sid, v_status from session_players where id = p_player_id;
  if not found then raise exception 'Not found'; end if;
  if v_status = 'left' then raise exception 'You have checked out — check in again to rejoin'; end if;
  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_sid;
  update session_players set status = 'queued', queue_order = v_order, queued_since = now() where id = p_player_id;
end;
$$;
grant execute on function backin_open_play(uuid) to anon, authenticated;
