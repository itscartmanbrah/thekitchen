-- Allow league admins to delete tournaments.
-- Divisions, entries, tournament players and bracket matches cascade away;
-- the real league matches created from tournament games are kept, so ELO
-- history and player records are untouched.

create policy "Admins can delete tournaments"
  on tournaments for delete using (is_league_admin(league_id));
