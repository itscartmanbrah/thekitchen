-- Skill Courts matching style: each court is a fixed skill tier (court 1 =
-- strongest) with its own queue. Reuses session_players.skill_level (migration
-- 054); only the match_mode value is new.

alter table play_sessions drop constraint if exists play_sessions_match_mode_check;
alter table play_sessions add constraint play_sessions_match_mode_check
  check (match_mode in ('balanced', 'skill', 'mixed', 'ladder', 'americano', 'mexicano', 'king', 'skill_courts'));
