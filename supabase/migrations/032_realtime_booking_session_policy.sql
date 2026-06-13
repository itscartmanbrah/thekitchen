-- 1) Live notifications: ensure the notifications table is in the realtime
--    publication so the bell's subscription actually receives INSERT events
--    (without this, clients only see notifications after a reload).
do $$
begin
  alter publication supabase_realtime add table notifications;
exception
  when duplicate_object then null;   -- already added
  when undefined_object then null;   -- publication missing (unexpected on Supabase)
end $$;

-- 2) League-level court info shown on the Courts tab.
alter table leagues
  add column if not exists cancellation_policy text,
  add column if not exists court_address text;

-- 3) Book a whole session (multiple hours on one court) in a single call so
--    admins get ONE notification instead of one per hour. Atomic: if any slot
--    overlaps an existing booking, nothing is booked.
create or replace function book_court_session(p_court_id uuid, p_starts_at timestamptz[])
returns void
language plpgsql
security definer
set search_path = public
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

  insert into court_bookings (court_id, league_id, user_id, starts_at, ends_at)
  select p_court_id, v_court.league_id, auth.uid(), s, s + interval '1 hour'
  from unnest(p_starts_at) as s;

  select min(s), max(s) + interval '1 hour' into v_min, v_max from unnest(p_starts_at) s;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), display_name)
    into v_booker from profiles where id = auth.uid();

  insert into notifications (user_id, type, title, body, data)
  select lm.user_id,
         'court_booking',
         '📅 New court booking',
         coalesce(v_booker, 'Someone') || ' booked ' || v_court.name || ' for '
           || to_char(v_min, 'Mon DD, HH12:MI AM') || '–' || to_char(v_max, 'HH12:MI AM')
           || ' (' || v_count || ' hr' || case when v_count > 1 then 's' else '' end || ')',
         jsonb_build_object('league_id', v_court.league_id, 'court_id', p_court_id)
  from league_members lm
  where lm.league_id = v_court.league_id
    and lm.role in ('head_admin', 'admin')
    and lm.status = 'active'
    and lm.user_id <> auth.uid();
exception
  when exclusion_violation then
    raise exception 'One or more of those slots were just booked by someone else — please review and try again.';
end;
$$;

grant execute on function book_court_session(uuid, timestamptz[]) to authenticated;
