-- Allow authenticated users to read any player's league memberships
-- so public player profiles can show stats.
-- Scoped to authenticated only (not anonymous), and only active members are visible.

drop policy if exists "Anyone can view a player's league memberships" on league_members;

create policy "Authenticated users can view active league memberships"
  on league_members for select using (
    auth.uid() is not null
    and (
      auth.uid() = user_id
      or league_id in (select auth_user_league_ids())
      or status = 'active'
    )
  );
