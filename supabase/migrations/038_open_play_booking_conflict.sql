-- Prevent scheduling an Open Play session over courts/times that already have
-- a confirmed booking. (Open Play occupies the court, so it must not collide
-- with an approved reservation.)

create or replace function create_play_session(
  p_league_id   uuid,
  p_name        text,
  p_court_ids   uuid[],
  p_format      text,
  p_match_mode  text,
  p_rated       boolean,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_allow_self_join boolean default true
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid; v_n int;
  v_start timestamptz; v_end timestamptz;
  v_clash text;
begin
  if not is_session_organizer(p_league_id) then
    raise exception 'Only admins or officiators can run Open Play sessions';
  end if;
  v_n := coalesce(array_length(p_court_ids, 1), 0);
  if v_n = 0 then raise exception 'Select at least one court'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End time must be after the start time';
  end if;
  if exists (select 1 from unnest(p_court_ids) c where c not in (select id from courts where league_id = p_league_id)) then
    raise exception 'One or more courts are not in this league';
  end if;

  v_start := coalesce(p_starts_at, now());
  v_end   := coalesce(p_ends_at, v_start + interval '4 hours');

  -- Reject if a confirmed booking overlaps the chosen window on any of these courts
  select string_agg(distinct co.name || ' (' || to_char(cb.starts_at, 'HH12:MI AM') || '–' || to_char(cb.ends_at, 'HH12:MI AM') || ')', ', ')
    into v_clash
  from court_bookings cb
  join courts co on co.id = cb.court_id
  where cb.court_id = any(p_court_ids)
    and cb.status = 'booked'
    and tstzrange(cb.starts_at, cb.ends_at) && tstzrange(v_start, v_end);

  if v_clash is not null then
    raise exception 'Those courts already have confirmed bookings in that window: %. Cancel or move the booking, or pick a different time/court.', v_clash;
  end if;

  insert into play_sessions (league_id, name, court_count, court_ids, format, match_mode, rated,
                             allow_self_join, starts_at, started_at, ends_at, status, created_by)
  values (p_league_id, p_name, v_n, p_court_ids, p_format, coalesce(p_match_mode, 'balanced'),
          coalesce(p_rated, false), coalesce(p_allow_self_join, true),
          v_start, v_start, p_ends_at,
          case when v_start > now() then 'scheduled' else 'active' end,
          auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_play_session(uuid, text, uuid[], text, text, boolean, timestamptz, timestamptz, boolean) to authenticated;
