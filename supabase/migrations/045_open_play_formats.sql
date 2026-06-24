-- Open Play social formats: allow Americano and Mexicano as session play styles.
-- (Round generation is client-side; games are created via create_session_game,
-- scored via complete_session_game, and ranked by the points standings.)

alter table play_sessions drop constraint if exists play_sessions_match_mode_check;
alter table play_sessions add constraint play_sessions_match_mode_check
  check (match_mode in ('balanced', 'skill', 'mixed', 'ladder', 'americano', 'mexicano'));
