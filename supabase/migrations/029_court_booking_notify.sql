-- Notify league admins when a member books a court.
-- Redefines book_court to insert a 'court_booking' notification for every
-- active head_admin / admin in the league (except the booker themselves).

create or replace function book_court(p_court_id uuid, p_starts_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court      courts%rowtype;
  v_ends       timestamptz;
  v_booking_id uuid;
  v_booker     text;
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

  if p_starts_at < now() then
    raise exception 'You can''t book a time in the past';
  end if;

  v_ends := p_starts_at + interval '1 hour';

  insert into court_bookings (court_id, league_id, user_id, starts_at, ends_at)
  values (p_court_id, v_court.league_id, auth.uid(), p_starts_at, v_ends)
  returning id into v_booking_id;

  select display_name into v_booker from profiles where id = auth.uid();

  insert into notifications (user_id, type, title, body, data)
  select lm.user_id,
         'court_booking',
         '📅 New court booking',
         coalesce(v_booker, 'Someone') || ' booked ' || v_court.name || ' for '
           || to_char(p_starts_at, 'Mon DD, HH12:MI AM'),
         jsonb_build_object('league_id', v_court.league_id, 'court_id', p_court_id, 'booking_id', v_booking_id)
  from league_members lm
  where lm.league_id = v_court.league_id
    and lm.role in ('head_admin', 'admin')
    and lm.status = 'active'
    and lm.user_id <> auth.uid();

  return v_booking_id;
exception
  when exclusion_violation then
    raise exception 'Sorry — that slot was just booked by someone else. Please pick another time.';
end;
$$;

grant execute on function book_court(uuid, timestamptz) to authenticated;
