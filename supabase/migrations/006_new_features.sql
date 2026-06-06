-- ── 1. League announcements ──────────────────────────────────────────────────
create table league_announcements (
  id         uuid primary key default uuid_generate_v4(),
  league_id  uuid not null references leagues(id) on delete cascade,
  content    text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table league_announcements enable row level security;
create policy "League members can view announcements"
  on league_announcements for select using (
    league_id in (select auth_user_league_ids())
  );
create policy "Admins can insert announcements"
  on league_announcements for insert with check (
    auth_user_is_league_admin(league_id)
  );
create policy "Admins can delete announcements"
  on league_announcements for delete using (
    auth_user_is_league_admin(league_id)
  );

-- ── 2. Invite links (multiple codes per league) ───────────────────────────────
create table invite_links (
  id         uuid primary key default uuid_generate_v4(),
  league_id  uuid not null references leagues(id) on delete cascade,
  code       text not null unique,
  label      text,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_count integer not null default 0,
  is_active  boolean not null default true
);
alter table invite_links enable row level security;
create policy "League admins can manage invite links"
  on invite_links for all using (
    auth_user_is_league_admin(league_id)
  );
create policy "Anyone can read active invite links by code"
  on invite_links for select using (is_active = true);

-- ── 3. Waitlist — add status column to league_members ────────────────────────
alter table league_members
  add column if not exists status text not null default 'active'
    check (status in ('active', 'pending'));

-- Existing rows are all active
update league_members set status = 'active' where status is null;

-- Pending members policy: you can see your own pending row
drop policy if exists "Members can view league memberships" on league_members;
create policy "Members can view league memberships"
  on league_members for select using (
    auth.uid() = user_id
    or league_id in (select auth_user_league_ids())
  );

-- ── 4. Match scheduled_at is already in schema — just needs UI
-- ── 5. Match notes is already in schema — just needs UI
