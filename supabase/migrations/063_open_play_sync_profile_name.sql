-- Keep a member's Open Play name/avatar in sync with their profile. Previously
-- the name was snapshotted at join time, so editing your profile (or the
-- email-derived name from Google sign-up) never updated in the session.

-- 1) Propagate profile name/avatar changes to the user's session_players rows.
create or replace function sync_session_player_name()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if NEW.display_name is distinct from OLD.display_name
     or NEW.avatar_color is distinct from OLD.avatar_color then
    update session_players
      set display_name = NEW.display_name,
          avatar_color = coalesce(NEW.avatar_color, avatar_color)
    where user_id = NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_profile_name_change on profiles;
create trigger on_profile_name_change after update on profiles
  for each row execute function sync_session_player_name();

-- 2) Use the canonical profile.display_name (nickname or first+last) when joining
--    / claiming, so the initial name matches what the trigger will keep in sync.
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

  select coalesce(nullif(trim(display_name), ''), nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Player'),
         avatar_color,
         case gender when 'male' then 'm' when 'female' then 'f' else null end
    into v_name, v_color, v_pgender
  from profiles where id = v_uid;

  v_gender := coalesce(case when p_gender in ('m', 'f') then p_gender else null end, v_pgender);

  select coalesce(max(queue_order), 0) + 1 into v_order from session_players where session_id = v_s.id;
  insert into session_players (session_id, user_id, display_name, avatar_color, skill, skill_level, gender, queue_order)
  values (v_s.id, v_uid, v_name, coalesce(v_color, '#16a34a'), 1000,
          case when p_skill_level between 1 and 5 then p_skill_level else null end,
          v_gender, v_order)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function join_open_play_member(text, int, text) to authenticated;

create or replace function claim_open_play_guests(p_player_ids uuid[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_count int := 0; v_pid uuid; v_sid uuid; v_name text; v_color text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select coalesce(nullif(trim(display_name), ''), nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Player'), avatar_color
    into v_name, v_color from profiles where id = v_uid;
  foreach v_pid in array coalesce(p_player_ids, '{}') loop
    select session_id into v_sid from session_players where id = v_pid and user_id is null;
    if v_sid is null then continue; end if;
    if exists (select 1 from session_players where session_id = v_sid and user_id = v_uid) then continue; end if;
    update session_players
      set user_id = v_uid, display_name = coalesce(v_name, display_name), avatar_color = coalesce(v_color, avatar_color), guest_name = null
    where id = v_pid and user_id is null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function claim_open_play_guests(uuid[]) to authenticated;
