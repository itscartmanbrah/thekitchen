-- Cancel a whole booking session in one call, with a single admin notification.
--
-- Cancelling per-hour previously sent one notification per hour. This cancels
-- all the booking's hours together and notifies each active admin (except the
-- person doing the cancellation) exactly once, using the booker's full name.
-- Member 2-hour rule and ownership still apply; admins can cancel anytime.

create or replace function cancel_court_session(p_booking_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league     uuid;
  v_court      uuid;
  v_owner      uuid;
  v_is_admin   boolean;
  v_earliest   timestamptz;
  v_court_name text;
  v_owner_name text;
begin
  if p_booking_ids is null or array_length(p_booking_ids, 1) is null then
    raise exception 'No bookings specified';
  end if;

  select league_id, court_id, user_id
    into v_league, v_court, v_owner
  from court_bookings where id = p_booking_ids[1];
  if not found then raise exception 'Booking not found'; end if;

  v_is_admin := is_league_admin(v_league);

  if not v_is_admin and exists (
    select 1 from court_bookings where id = any(p_booking_ids) and user_id <> auth.uid()
  ) then
    raise exception 'You can only cancel your own bookings';
  end if;

  select min(starts_at) into v_earliest
  from court_bookings where id = any(p_booking_ids) and status = 'booked';

  if v_earliest is null then return; end if;  -- already cancelled

  if not v_is_admin and v_earliest < now() + interval '2 hours' then
    raise exception 'Bookings can only be cancelled at least 2 hours before the start time — please contact the court admin.';
  end if;

  update court_bookings set status = 'cancelled'
  where id = any(p_booking_ids) and status = 'booked';

  select name into v_court_name from courts where id = v_court;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), display_name)
    into v_owner_name from profiles where id = v_owner;

  insert into notifications (user_id, type, title, body, data)
  select lm.user_id,
         'court_cancellation',
         '🚫 Court booking cancelled',
         coalesce(v_owner_name, 'A member') || '''s booking for ' || coalesce(v_court_name, 'a court')
           || ' on ' || to_char(v_earliest, 'Mon DD, HH12:MI AM') || ' was cancelled.',
         jsonb_build_object('league_id', v_league, 'court_id', v_court)
  from league_members lm
  where lm.league_id = v_league
    and lm.role in ('head_admin', 'admin')
    and lm.status = 'active'
    and lm.user_id <> auth.uid();
end;
$$;

grant execute on function cancel_court_session(uuid[]) to authenticated;
