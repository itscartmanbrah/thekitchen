create table challenges (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues(id) on delete cascade,
  challenger_id  uuid not null references profiles(id) on delete cascade,
  challenged_id  uuid not null references profiles(id) on delete cascade,
  officiator_id  uuid not null references profiles(id) on delete cascade,
  format         match_format not null default 'singles',
  proposed_at    timestamptz,
  message        text,
  status         text not null default 'pending_officiator'
                   check (status in (
                     'pending_officiator',
                     'pending_player',
                     'accepted',
                     'declined_officiator',
                     'declined_player',
                     'cancelled'
                   )),
  match_id       uuid references matches(id),
  created_at     timestamptz not null default now()
);

alter table challenges enable row level security;

-- All three participants + league admins can view
create policy "Participants can view challenges"
  on challenges for select using (
    auth.uid() in (challenger_id, challenged_id, officiator_id)
    or is_league_admin(league_id)
  );

-- Active league members can create challenges (as the challenger)
create policy "League members can create challenges"
  on challenges for insert with check (
    auth.uid() = challenger_id
    and exists (
      select 1 from league_members
      where league_members.league_id = challenges.league_id
        and league_members.user_id = auth.uid()
        and league_members.status = 'active'
    )
  );

-- Participants can respond (accept/decline/cancel)
create policy "Participants can update challenges"
  on challenges for update using (
    auth.uid() in (challenger_id, challenged_id, officiator_id)
    or is_league_admin(league_id)
  );

create index on challenges(league_id);
create index on challenges(challenger_id);
create index on challenges(challenged_id);
create index on challenges(officiator_id);
create index on challenges(status);
