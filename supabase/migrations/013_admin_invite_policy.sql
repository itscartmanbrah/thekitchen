-- Allow admins to directly insert members into leagues they manage.
-- The existing insert policy only permits users to join themselves.
-- This additional policy permits admins to invite anyone.
create policy "Admins can insert members"
  on league_members for insert with check (
    exists (
      select 1 from league_members lm2
      where lm2.league_id = league_members.league_id
        and lm2.user_id = auth.uid()
        and lm2.role in ('head_admin', 'admin')
        and lm2.status = 'active'
    )
  );
