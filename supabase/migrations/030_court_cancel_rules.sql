-- Court cancellation rules + contact phone.
--
--  - Courts get a contact_phone so members can reach the admin when they can
--    no longer self-cancel.
--  - Members may only cancel at least 2 hours before the booking starts.
--    League admins can cancel any booking at any time.

alter table courts add column if not exists contact_phone text;

create or replace function cancel_court_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b        court_bookings%rowtype;
  v_is_admin boolean;
begin
  select * into v_b from court_bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;

  v_is_admin := is_league_admin(v_b.league_id);

  if v_b.user_id <> auth.uid() and not v_is_admin then
    raise exception 'You can only cancel your own bookings';
  end if;

  if not v_is_admin and v_b.starts_at < now() + interval '2 hours' then
    raise exception 'Bookings can only be cancelled at least 2 hours before the start time — please contact the court admin.';
  end if;

  update court_bookings set status = 'cancelled' where id = p_booking_id;
end;
$$;

grant execute on function cancel_court_booking(uuid) to authenticated;
