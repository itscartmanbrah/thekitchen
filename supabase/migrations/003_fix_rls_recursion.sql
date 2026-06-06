-- Fix infinite recursion in league_members RLS policies.
-- The self-referential SELECT policy caused a loop whenever league_members
-- was queried (including during INSERT checks on other policies).
-- Solution: a security definer function that reads league_members as postgres
-- (bypassing RLS), used as the authority for "is this user in this league?"

create or replace function auth_user_league_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select league_id from league_members where user_id = auth.uid()
$$;

create or replace function auth_user_is_league_admin(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from league_members
    where league_id = p_league_id
      and user_id = auth.uid()
      and role in ('head_admin', 'admin')
  )
$$;

-- ── league_members policies ───────────────────────────────────────────────

drop policy if exists "Members can view their own league memberships" on league_members;
drop policy if exists "Admins can update member roles" on league_members;
drop policy if exists "Admins can remove members" on league_members;

create policy "Members can view league memberships"
  on league_members for select using (
    auth.uid() = user_id
    or league_id in (select auth_user_league_ids())
  );

create policy "Admins can update member roles"
  on league_members for update using (
    auth.uid() = user_id
    or auth_user_is_league_admin(league_id)
  );

create policy "Admins can remove members"
  on league_members for delete using (
    auth.uid() = user_id
    or auth_user_is_league_admin(league_id)
  );

-- ── leagues policies (also referenced league_members, safe now) ───────────

drop policy if exists "League members can view their leagues" on leagues;
drop policy if exists "Admins can update leagues" on leagues;
drop policy if exists "Head admin can delete leagues" on leagues;

create policy "League members can view their leagues"
  on leagues for select using (
    id in (select auth_user_league_ids())
  );

create policy "Admins can update leagues"
  on leagues for update using (
    auth_user_is_league_admin(id)
  );

create policy "Head admin can delete leagues"
  on leagues for delete using (
    exists (
      select 1 from league_members
      where league_id = id
        and user_id = auth.uid()
        and role = 'head_admin'
    )
  );

-- ── matches policies ──────────────────────────────────────────────────────

drop policy if exists "League members can view matches" on matches;
drop policy if exists "Admins can create matches" on matches;
drop policy if exists "Admins and officiators can update matches" on matches;

create policy "League members can view matches"
  on matches for select using (
    league_id in (select auth_user_league_ids())
  );

create policy "Admins can create matches"
  on matches for insert with check (
    auth_user_is_league_admin(league_id)
  );

create policy "Admins and officiators can update matches"
  on matches for update using (
    auth_user_is_league_admin(league_id)
    or officiator_id = auth.uid()
  );

-- ── match_players policies ────────────────────────────────────────────────

drop policy if exists "League members can view match players" on match_players;
drop policy if exists "Admins can insert match players" on match_players;
drop policy if exists "Admins and officiators can update match players" on match_players;

create policy "League members can view match players"
  on match_players for select using (
    exists (
      select 1 from matches
      where matches.id = match_players.match_id
        and matches.league_id in (select auth_user_league_ids())
    )
  );

create policy "Admins can insert match players"
  on match_players for insert with check (
    exists (
      select 1 from matches
      where matches.id = match_players.match_id
        and auth_user_is_league_admin(matches.league_id)
    )
  );

create policy "Admins and officiators can update match players"
  on match_players for update using (
    exists (
      select 1 from matches
      where matches.id = match_players.match_id
        and (
          auth_user_is_league_admin(matches.league_id)
          or matches.officiator_id = auth.uid()
        )
    )
  );

-- ── point_transactions policies ───────────────────────────────────────────

drop policy if exists "Users can view their own transactions" on point_transactions;
drop policy if exists "Admins and officiators can insert transactions" on point_transactions;

create policy "Users can view their own transactions"
  on point_transactions for select using (
    auth.uid() = user_id
    or auth_user_is_league_admin(league_id)
  );

create policy "Admins and officiators can insert transactions"
  on point_transactions for insert with check (
    auth_user_is_league_admin(league_id)
    or exists (
      select 1 from matches
      where matches.id = point_transactions.match_id
        and matches.officiator_id = auth.uid()
    )
  );
