-- Performance indexes for new tables
create index if not exists idx_invite_links_league_active
  on invite_links (league_id, is_active);

create index if not exists idx_league_announcements_league
  on league_announcements (league_id, created_at desc);

create index if not exists idx_league_members_status
  on league_members (league_id, status);

create index if not exists idx_point_transactions_user_league
  on point_transactions (user_id, league_id, created_at);
