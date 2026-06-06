-- Drop old policy if it exists, then recreate with correct rules:
-- Admin: can delete any match (completed or not)
-- Officiator: can only delete matches that are not yet completed
drop policy if exists "Admins and officiators can delete matches" on matches;

create policy "Admins and officiators can delete matches"
  on matches for delete using (
    -- Admins can delete any match
    exists (
      select 1 from league_members
      where league_members.league_id = matches.league_id
        and league_members.user_id = auth.uid()
        and league_members.role in ('head_admin', 'admin')
        and league_members.status = 'active'
    )
    or
    -- Officiator can only delete matches with no score yet (not completed/cancelled)
    (
      matches.officiator_id = auth.uid()
      and matches.status not in ('completed', 'cancelled')
    )
  );
