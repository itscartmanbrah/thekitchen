-- Fix leagues DELETE policy — raw league_members subquery caused RLS recursion.
-- Add a security definer helper for head_admin check, same pattern as 003.

create or replace function auth_user_is_league_head_admin(p_league_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from league_members
    where league_id = p_league_id
      and user_id = auth.uid()
      and role = 'head_admin'
  )
$$;

drop policy if exists "Head admin can delete leagues" on leagues;

create policy "Head admin can delete leagues"
  on leagues for delete using (
    auth_user_is_league_head_admin(id)
  );
