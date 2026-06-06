-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────
create type league_role as enum ('head_admin', 'admin', 'officiator', 'player');
create type match_format as enum ('singles', 'doubles', 'mixed_doubles', 'round_robin');
create type match_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  email         text not null,
  display_name  text not null,
  avatar_color  text not null default '#16a34a',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view all profiles"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Trigger: auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, display_name, avatar_color)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#16a34a')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─────────────────────────────────────────────
-- leagues (no cross-ref policies yet)
-- ─────────────────────────────────────────────
create table leagues (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  description   text,
  location      text,
  invite_code   text not null unique,
  banner_color  text not null default '#16a34a',
  created_by    uuid not null references profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table leagues enable row level security;

create policy "Authenticated users can create leagues"
  on leagues for insert with check (auth.uid() = created_by);

create policy "Anyone can look up leagues by invite code"
  on leagues for select using (true);

-- ─────────────────────────────────────────────
-- league_members
-- ─────────────────────────────────────────────
create table league_members (
  id          uuid primary key default uuid_generate_v4(),
  league_id   uuid not null references leagues(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        league_role not null default 'player',
  elo_rating  integer not null default 1000,
  wins        integer not null default 0,
  losses      integer not null default 0,
  joined_at   timestamptz not null default now(),
  unique(league_id, user_id)
);

alter table league_members enable row level security;

create policy "Members can view their own league memberships"
  on league_members for select using (
    auth.uid() = user_id
    or exists (
      select 1 from league_members lm2
      where lm2.league_id = league_members.league_id
        and lm2.user_id = auth.uid()
    )
  );

create policy "Authenticated users can join leagues"
  on league_members for insert with check (auth.uid() = user_id);

create policy "Admins can update member roles"
  on league_members for update using (
    auth.uid() = user_id
    or exists (
      select 1 from league_members lm2
      where lm2.league_id = league_members.league_id
        and lm2.user_id = auth.uid()
        and lm2.role in ('head_admin', 'admin')
    )
  );

create policy "Admins can remove members"
  on league_members for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from league_members lm2
      where lm2.league_id = league_members.league_id
        and lm2.user_id = auth.uid()
        and lm2.role in ('head_admin', 'admin')
    )
  );

-- ─────────────────────────────────────────────
-- leagues RLS policies that reference league_members
-- (added after league_members exists)
-- ─────────────────────────────────────────────
create policy "League members can view their leagues"
  on leagues for select using (
    exists (
      select 1 from league_members
      where league_members.league_id = leagues.id
        and league_members.user_id = auth.uid()
    )
  );

create policy "Admins can update leagues"
  on leagues for update using (
    exists (
      select 1 from league_members
      where league_members.league_id = leagues.id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
    )
  );

create policy "Head admin can delete leagues"
  on leagues for delete using (
    exists (
      select 1 from league_members
      where league_members.league_id = leagues.id
        and league_members.user_id = auth.uid()
        and league_members.role = 'head_admin'
    )
  );

-- ─────────────────────────────────────────────
-- matches
-- ─────────────────────────────────────────────
create table matches (
  id            uuid primary key default uuid_generate_v4(),
  league_id     uuid not null references leagues(id) on delete cascade,
  format        match_format not null,
  status        match_status not null default 'scheduled',
  officiator_id uuid references profiles(id),
  team1_score   integer,
  team2_score   integer,
  max_points    integer not null default 11,
  scheduled_at  timestamptz,
  completed_at  timestamptz,
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  notes         text
);

alter table matches enable row level security;

create policy "League members can view matches"
  on matches for select using (
    exists (
      select 1 from league_members
      where league_members.league_id = matches.league_id
        and league_members.user_id = auth.uid()
    )
  );

create policy "Admins can create matches"
  on matches for insert with check (
    exists (
      select 1 from league_members
      where league_members.league_id = matches.league_id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
    )
  );

create policy "Admins and officiators can update matches"
  on matches for update using (
    exists (
      select 1 from league_members
      where league_members.league_id = matches.league_id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
    )
    or officiator_id = auth.uid()
  );

-- ─────────────────────────────────────────────
-- match_players
-- ─────────────────────────────────────────────
create table match_players (
  id          uuid primary key default uuid_generate_v4(),
  match_id    uuid not null references matches(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  team        integer not null check (team in (1, 2)),
  elo_before  integer not null,
  elo_after   integer,
  created_at  timestamptz not null default now()
);

alter table match_players enable row level security;

create policy "League members can view match players"
  on match_players for select using (
    exists (
      select 1 from matches
      join league_members on league_members.league_id = matches.league_id
      where matches.id = match_players.match_id
        and league_members.user_id = auth.uid()
    )
  );

create policy "Admins can insert match players"
  on match_players for insert with check (
    exists (
      select 1 from matches
      join league_members on league_members.league_id = matches.league_id
      where matches.id = match_players.match_id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
    )
  );

create policy "Admins and officiators can update match players"
  on match_players for update using (
    exists (
      select 1 from matches
      join league_members on league_members.league_id = matches.league_id
      where matches.id = match_players.match_id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
    )
    or exists (
      select 1 from matches
      where matches.id = match_players.match_id
        and matches.officiator_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- point_transactions
-- ─────────────────────────────────────────────
create table point_transactions (
  id            uuid primary key default uuid_generate_v4(),
  match_id      uuid not null references matches(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  league_id     uuid not null references leagues(id) on delete cascade,
  points_before integer not null,
  points_after  integer not null,
  delta         integer not null,
  created_at    timestamptz not null default now()
);

alter table point_transactions enable row level security;

create policy "Users can view their own transactions"
  on point_transactions for select using (
    auth.uid() = user_id
    or exists (
      select 1 from league_members
      where league_members.league_id = point_transactions.league_id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
    )
  );

create policy "Admins and officiators can insert transactions"
  on point_transactions for insert with check (
    exists (
      select 1 from league_members
      where league_members.league_id = point_transactions.league_id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
    )
    or exists (
      select 1 from matches
      where matches.id = point_transactions.match_id
        and matches.officiator_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
create index on league_members (league_id, elo_rating desc);
create index on league_members (user_id);
create index on matches (league_id, created_at desc);
create index on match_players (match_id);
create index on point_transactions (user_id, league_id);
create index on leagues (invite_code);
