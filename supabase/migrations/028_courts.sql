-- Court booking (Phase 1): hourly slots, no payments.
--
-- Double-booking is made impossible at the database level via a GiST exclusion
-- constraint: no two 'booked' rows on the same court can have overlapping time
-- ranges, no matter how many people tap the same slot at once.

create extension if not exists btree_gist;

create table courts (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  name        text not null,
  is_indoor   boolean not null default false,
  open_hour   int not null default 6  check (open_hour >= 0 and open_hour < 24),
  close_hour  int not null default 22 check (close_hour > 0 and close_hour <= 24),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (close_hour > open_hour)
);

create table court_bookings (
  id          uuid primary key default gen_random_uuid(),
  court_id    uuid not null references courts(id) on delete cascade,
  league_id   uuid not null references leagues(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'booked' check (status in ('booked', 'cancelled')),
  created_at  timestamptz not null default now(),
  constraint court_booking_no_overlap exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'booked')
);

create index idx_courts_league on courts(league_id);
create index idx_court_bookings_court_time on court_bookings(court_id, starts_at);
create index idx_court_bookings_league on court_bookings(league_id);

alter table courts enable row level security;
alter table court_bookings enable row level security;

-- Members can see courts and bookings in their leagues
create policy "League members can view courts"
  on courts for select using (league_id in (select auth_user_league_ids()));
create policy "League members can view court bookings"
  on court_bookings for select using (league_id in (select auth_user_league_ids()));

-- Admins manage courts directly
create policy "Admins can insert courts"
  on courts for insert with check (is_league_admin(league_id));
create policy "Admins can update courts"
  on courts for update using (is_league_admin(league_id));
create policy "Admins can delete courts"
  on courts for delete using (is_league_admin(league_id));

-- Bookings are created/cancelled through the security-definer RPCs below.

-- ── book_court ───────────────────────────────────────────────────────────────
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

  return v_booking_id;
exception
  when exclusion_violation then
    raise exception 'Sorry — that slot was just booked by someone else. Please pick another time.';
end;
$$;

grant execute on function book_court(uuid, timestamptz) to authenticated;

-- ── cancel_court_booking ─────────────────────────────────────────────────────
create or replace function cancel_court_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b court_bookings%rowtype;
begin
  select * into v_b from court_bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;

  if v_b.user_id <> auth.uid() and not is_league_admin(v_b.league_id) then
    raise exception 'You can only cancel your own bookings';
  end if;

  update court_bookings set status = 'cancelled' where id = p_booking_id;
end;
$$;

grant execute on function cancel_court_booking(uuid) to authenticated;
