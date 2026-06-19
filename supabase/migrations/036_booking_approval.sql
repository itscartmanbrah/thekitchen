-- Court bookings become admin-approved requests.
--   player books -> status 'pending' -> admins notified -> approve or reject (with reason)
-- A slot can hold only one active (pending or booked) request at a time.

alter table court_bookings
  add column if not exists reject_reason text,
  add column if not exists decided_by  uuid references auth.users(id),
  add column if not exists decided_at   timestamptz;

alter table court_bookings alter column status set default 'pending';

alter table court_bookings drop constraint if exists court_bookings_status_check;
alter table court_bookings add constraint court_bookings_status_check
  check (status in ('pending', 'booked', 'cancelled', 'rejected'));

-- Overlap protection now also covers pending requests
alter table court_bookings drop constraint if exists court_booking_no_overlap;
alter table court_bookings add constraint court_booking_no_overlap
  exclude using gist (court_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status in ('pending', 'booked'));

-- ── book_court_session: create PENDING requests + notify admins ──────────────
create or replace function book_court_session(p_court_id uuid, p_starts_at timestamptz[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_court  courts%rowtype;
  v_booker text;
  v_min    timestamptz;
  v_max    timestamptz;
  v_count  int;
begin
  select * into v_court from courts where id = p_court_id;
  if not found then raise exception 'Court not found'; end if;
  if not v_court.active then raise exception 'This court is not available for booking'; end if;

  if not exists (
    select 1 from league_members
    where league_id = v_court.league_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'You must be an active member of this league to book a court';
  end if;

  v_count := coalesce(array_length(p_starts_at, 1), 0);
  if v_count = 0 then raise exception 'No times selected'; end if;

  select min(s) into v_min from unnest(p_starts_at) s;
  if v_min < now() then raise exception 'You can''t book a time in the past'; end if;

  insert into court_bookings (court_id, league_id, user_id, starts_at, ends_at, status)
  select p_court_id, v_court.league_id, auth.uid(), s, s + interval '1 hour', 'pending'
  from unnest(p_starts_at) as s;

  select min(s), max(s) + interval '1 hour' into v_min, v_max from unnest(p_starts_at) s;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), display_name)
    into v_booker from profiles where id = auth.uid();

  insert into notifications (user_id, type, title, body, data)
  select lm.user_id,
         'booking_request',
         '📥 Court booking request',
         coalesce(v_booker, 'A member') || ' requested ' || v_court.name || ' for '
           || to_char(v_min, 'Mon DD, HH12:MI AM') || '–' || to_char(v_max, 'HH12:MI AM')
           || ' — review it in Bookings.',
         jsonb_build_object('league_id', v_court.league_id, 'court_id', p_court_id)
  from league_members lm
  where lm.league_id = v_court.league_id
    and lm.role in ('head_admin', 'admin')
    and lm.status = 'active'
    and lm.user_id <> auth.uid();
exception
  when exclusion_violation then
    raise exception 'One or more of those slots already have a pending or confirmed booking — please pick another time.';
end;
$$;
grant execute on function book_court_session(uuid, timestamptz[]) to authenticated;

-- ── approve_booking_request ─────────────────────────────────────────────────
create or replace function approve_booking_request(p_booking_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare v_league uuid; v_court uuid; v_owner uuid; v_min timestamptz; v_court_name text;
begin
  select league_id, court_id, user_id into v_league, v_court, v_owner
  from court_bookings where id = p_booking_ids[1];
  if not found then raise exception 'Booking not found'; end if;
  if not is_league_admin(v_league) then raise exception 'Only admins can approve bookings'; end if;

  update court_bookings set status = 'booked', decided_by = auth.uid(), decided_at = now()
  where id = any(p_booking_ids) and status = 'pending';

  select min(starts_at) into v_min from court_bookings where id = any(p_booking_ids);
  select name into v_court_name from courts where id = v_court;

  insert into notifications (user_id, type, title, body, data)
  values (v_owner, 'booking_approved', '✅ Booking approved',
          'Your booking for ' || coalesce(v_court_name, 'a court') || ' on '
            || to_char(v_min, 'Mon DD, HH12:MI AM') || ' was approved.',
          jsonb_build_object('league_id', v_league, 'court_id', v_court));
end;
$$;
grant execute on function approve_booking_request(uuid[]) to authenticated;

-- ── reject_booking_request (with reason) ────────────────────────────────────
create or replace function reject_booking_request(p_booking_ids uuid[], p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_league uuid; v_court uuid; v_owner uuid; v_min timestamptz; v_court_name text;
begin
  select league_id, court_id, user_id into v_league, v_court, v_owner
  from court_bookings where id = p_booking_ids[1];
  if not found then raise exception 'Booking not found'; end if;
  if not is_league_admin(v_league) then raise exception 'Only admins can reject bookings'; end if;

  update court_bookings
    set status = 'rejected', reject_reason = nullif(trim(p_reason), ''), decided_by = auth.uid(), decided_at = now()
  where id = any(p_booking_ids) and status = 'pending';

  select min(starts_at) into v_min from court_bookings where id = any(p_booking_ids);
  select name into v_court_name from courts where id = v_court;

  insert into notifications (user_id, type, title, body, data)
  values (v_owner, 'booking_rejected', '❌ Booking not approved',
          'Your booking for ' || coalesce(v_court_name, 'a court') || ' on '
            || to_char(v_min, 'Mon DD, HH12:MI AM') || ' was declined'
            || case when nullif(trim(p_reason), '') is not null then ': ' || trim(p_reason) else '.' end,
          jsonb_build_object('league_id', v_league, 'court_id', v_court));
end;
$$;
grant execute on function reject_booking_request(uuid[], text) to authenticated;

-- ── cancel: allow withdrawing a pending request without the 2-hour rule ──────
create or replace function cancel_court_session(p_booking_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_league uuid; v_court uuid; v_owner uuid; v_is_admin boolean;
  v_earliest timestamptz; v_court_name text; v_owner_name text; v_has_booked boolean;
begin
  if p_booking_ids is null or array_length(p_booking_ids, 1) is null then
    raise exception 'No bookings specified';
  end if;

  select league_id, court_id, user_id into v_league, v_court, v_owner
  from court_bookings where id = p_booking_ids[1];
  if not found then raise exception 'Booking not found'; end if;

  v_is_admin := is_league_admin(v_league);
  if not v_is_admin and exists (
    select 1 from court_bookings where id = any(p_booking_ids) and user_id <> auth.uid()
  ) then
    raise exception 'You can only cancel your own bookings';
  end if;

  select min(starts_at), bool_or(status = 'booked') into v_earliest, v_has_booked
  from court_bookings where id = any(p_booking_ids) and status in ('pending', 'booked');
  if v_earliest is null then return; end if;

  -- 2-hour rule only applies to confirmed bookings cancelled by a member
  if not v_is_admin and v_has_booked and v_earliest < now() + interval '2 hours' then
    raise exception 'Confirmed bookings can only be cancelled at least 2 hours before the start time — please contact the court admin.';
  end if;

  update court_bookings set status = 'cancelled'
  where id = any(p_booking_ids) and status in ('pending', 'booked');

  select name into v_court_name from courts where id = v_court;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), display_name)
    into v_owner_name from profiles where id = v_owner;

  insert into notifications (user_id, type, title, body, data)
  select lm.user_id, 'court_cancellation', '🚫 Court booking cancelled',
    coalesce(v_owner_name, 'A member') || '''s booking for ' || coalesce(v_court_name, 'a court')
      || ' on ' || to_char(v_earliest, 'Mon DD, HH12:MI AM') || ' was cancelled.',
    jsonb_build_object('league_id', v_league, 'court_id', v_court)
  from league_members lm
  where lm.league_id = v_league and lm.role in ('head_admin', 'admin') and lm.status = 'active'
    and lm.user_id <> auth.uid();
end;
$$;
grant execute on function cancel_court_session(uuid[]) to authenticated;
