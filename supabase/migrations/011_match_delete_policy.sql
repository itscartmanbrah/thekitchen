-- Allow admins, the officiator, or the match creator to delete a match
create policy "Admins and officiators can delete matches"
  on matches for delete using (
    auth.uid() = created_by
    or auth.uid() = officiator_id
    or exists (
      select 1 from league_members
      where league_members.league_id = matches.league_id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
        and league_members.status = 'active'
    )
  );
