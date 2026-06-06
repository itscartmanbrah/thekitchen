-- Performance indexes to speed up common queries

-- match_players by user_id — used in head-to-head, form dots, match lookups
create index if not exists idx_match_players_user_id
  on match_players(user_id);

-- match_players by user_id + match_id together (covering index for join)
create index if not exists idx_match_players_user_match
  on match_players(user_id, match_id);

-- matches filtered by league + status + date (leaderboard form, match list)
create index if not exists idx_matches_league_status_date
  on matches(league_id, status, completed_at desc);

create index if not exists idx_matches_league_created
  on matches(league_id, created_at desc);

-- notifications by user — bell always filters by user_id
create index if not exists idx_notifications_user_id
  on notifications(user_id, created_at desc);

-- league_members by user_id + status — public profile membership lookup
create index if not exists idx_league_members_user_status
  on league_members(user_id, status);

-- point_transactions by league + user + date (ELO history chart)
create index if not exists idx_point_tx_league_user_date
  on point_transactions(league_id, user_id, created_at asc);
