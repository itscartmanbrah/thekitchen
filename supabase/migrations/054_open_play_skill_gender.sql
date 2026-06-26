-- Per-player attributes for two more matching styles:
--   * skill_level (1–5) for Skill-separated matching
--   * gender ('m'/'f') for Mixed Doubles
-- Both are nullable; the organizer (or the player at check-in) can set them.
-- The 'skill' and 'mixed' match_modes are already allowed by the existing
-- play_sessions.match_mode check.

alter table session_players add column if not exists skill_level int;
alter table session_players add column if not exists gender text;
alter table session_players drop constraint if exists session_players_gender_check;
alter table session_players add constraint session_players_gender_check
  check (gender in ('m', 'f') or gender is null);
alter table session_players drop constraint if exists session_players_skill_level_check;
alter table session_players add constraint session_players_skill_level_check
  check (skill_level is null or skill_level between 1 and 5);

-- Set (or clear-skip) a player's skill level and/or gender. Passing null leaves
-- that field unchanged, so callers can update just one.
create or replace function set_session_player_meta(p_player_id uuid, p_skill_level int, p_gender text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_sid uuid;
begin
  select session_id into v_sid from session_players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;
  if not can_manage_session(v_sid) then raise exception 'Not authorised'; end if;
  update session_players set
    skill_level = coalesce(p_skill_level, skill_level),
    gender      = coalesce(nullif(p_gender, ''), gender)
  where id = p_player_id;
end;
$$;
grant execute on function set_session_player_meta(uuid, int, text) to authenticated;
