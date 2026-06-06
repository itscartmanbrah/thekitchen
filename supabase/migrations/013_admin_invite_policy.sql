-- Drop the recursive policy
drop policy if exists "Admins can insert members" on league_members;

-- Security definer function checks admin status without triggering RLS,
-- breaking the infinite recursion.
create or replace function is_league_admin(p_league_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from league_members
    where league_id = p_league_id
      and user_id = auth.uid()
      and role in ('head_admin', 'admin')
      and status = 'active'
  );
$$;

-- Allow a user to insert their own row (joining) OR an admin to insert any row
create policy "Admins can insert members"
  on league_members for insert with check (
    auth.uid() = user_id
    or is_league_admin(league_id)
  );
