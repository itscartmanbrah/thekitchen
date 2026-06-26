-- Fix: the self check-in toggle (set_session_self_join) still used the league-
-- only is_session_organizer check, so standalone (solo) hosts got "Not
-- authorised" when toggling "Let players check themselves in". Re-point it to
-- can_manage_session, which also covers solo sessions (created_by = auth.uid()).

create or replace function set_session_self_join(p_session_id uuid, p_allow boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not can_manage_session(p_session_id) then raise exception 'Not authorised'; end if;
  update play_sessions set allow_self_join = p_allow where id = p_session_id;
end;
$$;
grant execute on function set_session_self_join(uuid, boolean) to authenticated;
