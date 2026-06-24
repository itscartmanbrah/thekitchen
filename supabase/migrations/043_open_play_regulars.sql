-- "Regular Players": save frequent drop-in guests per league so organizers can
-- re-add them with one tap instead of retyping the name each session.

create table if not exists open_play_regulars (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues(id) on delete cascade,
  name       text not null,
  skill      int  not null default 1000,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists open_play_regulars_unique on open_play_regulars (league_id, lower(name));

alter table open_play_regulars enable row level security;

drop policy if exists "view regulars" on open_play_regulars;
create policy "view regulars" on open_play_regulars
  for select using (league_id in (select auth_user_league_ids()));

drop policy if exists "add regulars" on open_play_regulars;
create policy "add regulars" on open_play_regulars
  for insert with check (is_session_organizer(league_id));

drop policy if exists "remove regulars" on open_play_regulars;
create policy "remove regulars" on open_play_regulars
  for delete using (is_session_organizer(league_id));
