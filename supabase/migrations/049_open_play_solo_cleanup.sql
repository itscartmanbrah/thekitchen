-- Keep the DB tidy: auto-delete standalone (leagueless) Open Play sessions a
-- week after they end. Players/games cascade away with the session.

create or replace function delete_stale_solo_sessions()
returns void language sql security definer set search_path = public
as $$
  delete from play_sessions
  where league_id is null
    and coalesce(ended_at, ends_at, started_at) < now() - interval '7 days';
$$;

-- Schedule it daily if pg_cron is available (no-op otherwise; you can also run
-- delete_stale_solo_sessions() manually or from an edge function).
do $$
begin
  perform cron.schedule('expire-solo-open-play', '0 4 * * *', $cron$ select delete_stale_solo_sessions(); $cron$);
exception when others then null;
end $$;
