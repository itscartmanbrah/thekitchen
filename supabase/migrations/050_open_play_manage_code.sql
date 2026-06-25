-- Recoverable standalone sessions: a secret manage_code gives the organizer a
-- bookmarkable host link that survives a cleared browser or a different device.

alter table play_sessions
  add column if not exists manage_code text;
update play_sessions set manage_code = substr(md5(random()::text || id::text), 1, 12) where manage_code is null;
alter table play_sessions alter column manage_code set default substr(md5(random()::text), 1, 12);
create unique index if not exists play_sessions_manage_code_key on play_sessions(manage_code);

-- create_solo_session now returns the id + share/manage codes.
create or replace function create_solo_session(
  p_name text, p_court_count int, p_format text, p_match_mode text
) returns json
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_mc text; v_sc text;
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name your session'; end if;
  insert into play_sessions (league_id, name, court_count, court_ids, format, match_mode, rated,
                             allow_self_join, starts_at, started_at, ends_at, status, created_by)
  values (null, trim(p_name), greatest(1, least(15, coalesce(p_court_count, 1))), null,
          coalesce(p_format, 'doubles'), coalesce(p_match_mode, 'balanced'), false,
          true, now(), now(), null, 'active', auth.uid())
  returning id, manage_code, share_code into v_id, v_mc, v_sc;
  return json_build_object('id', v_id, 'manage_code', v_mc, 'share_code', v_sc);
end;
$$;
grant execute on function create_solo_session(text, int, text, text) to authenticated;

-- Open a standalone session by its secret manage link: claim ownership for this
-- device's (anonymous) account so the existing can_manage_session() checks pass.
-- Recovery + co-host: whoever holds the private link can run it.
create or replace function adopt_solo_session(p_manage_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  update play_sessions set created_by = auth.uid()
    where manage_code = p_manage_code and league_id is null
    returning id into v_id;
  if v_id is null then raise exception 'Session not found'; end if;
  return v_id;
end;
$$;
grant execute on function adopt_solo_session(text) to authenticated;
