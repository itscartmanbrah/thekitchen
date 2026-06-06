-- ── Seasons ──────────────────────────────────────────────────────────────────
create table seasons (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  name        text not null,
  status      text not null default 'active' check (status in ('active', 'ended')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);

alter table seasons enable row level security;

create policy "League members can view seasons"
  on seasons for select using (
    exists (
      select 1 from league_members
      where league_members.league_id = seasons.league_id
        and league_members.user_id = auth.uid()
        and league_members.status = 'active'
    )
  );

create policy "Admins can manage seasons"
  on seasons for all using (is_league_admin(league_id))
  with check (is_league_admin(league_id));

-- ── Season results (snapshot at end of season) ────────────────────────────
create table season_results (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  league_id   uuid not null references leagues(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  final_elo   integer not null,
  final_rank  integer not null,
  wins        integer not null default 0,
  losses      integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table season_results enable row level security;

create policy "League members can view season results"
  on season_results for select using (
    exists (
      select 1 from league_members
      where league_members.league_id = season_results.league_id
        and league_members.user_id = auth.uid()
        and league_members.status = 'active'
    )
  );

create policy "Admins can insert season results"
  on season_results for insert with check (is_league_admin(league_id));

-- ── Tag matches with a season ─────────────────────────────────────────────
alter table matches add column if not exists season_id uuid references seasons(id);

create index on seasons(league_id, status);
create index on season_results(season_id);
create index on season_results(user_id, league_id);
