-- Allow invited players to see their own pending invite row so the
-- league page can show them the accept/decline screen.
-- The existing select policy only shows rows where status = 'active',
-- so we add a policy for users to see their own row regardless of status.
create policy "Users can view their own membership"
  on league_members for select using (
    auth.uid() = user_id
  );
