-- Open Play "King of the Court" format: winners move up a court, losers move
-- down, re-paired each round. (Round generation + movement is client-side;
-- games/scores reuse the existing RPCs.)

alter table play_sessions drop constraint if exists play_sessions_match_mode_check;
alter table play_sessions add constraint play_sessions_match_mode_check
  check (match_mode in ('balanced', 'skill', 'mixed', 'ladder', 'americano', 'mexicano', 'king'));
