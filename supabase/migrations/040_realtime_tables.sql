-- Enable realtime so the UI updates live (leaderboard, overview, courts,
-- bookings, open play console, members) without a manual refresh.
--   1) add each table to the supabase_realtime publication
--   2) REPLICA IDENTITY FULL so UPDATE/DELETE events carry the old row, which
--      lets league_id=eq.* subscription filters match on those events too.

do $$
declare t text;
begin
  foreach t in array array[
    'league_members', 'matches', 'match_players',
    'court_bookings', 'play_sessions', 'session_players', 'session_games'
  ] loop
    -- add to publication (ignore if already a member)
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;   -- publication missing (unexpected on Supabase)
    end;
    -- full row image for change events
    execute format('alter table %I replica identity full', t);
  end loop;
end $$;
