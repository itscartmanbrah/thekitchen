-- Add 'invited' as a valid status for league_members
alter table league_members
  drop constraint if exists league_members_status_check;

alter table league_members
  add constraint league_members_status_check
  check (status in ('active', 'pending', 'invited'));
