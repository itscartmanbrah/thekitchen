-- King of the Court partner rotation: 'split' (default — winners/losers move by
-- court and teams are remixed each round) or 'keep' (winning and losing pairs
-- stay together as a unit as they move courts). Mirrors the PickleQ option.

alter table play_sessions add column if not exists partner_rotation text not null default 'split';
alter table play_sessions drop constraint if exists play_sessions_partner_rotation_check;
alter table play_sessions add constraint play_sessions_partner_rotation_check
  check (partner_rotation in ('split', 'keep'));

create or replace function set_session_partner_rotation(p_session_id uuid, p_mode text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_mode not in ('split', 'keep') then raise exception 'Invalid rotation'; end if;
  if not can_manage_session(p_session_id) then raise exception 'Not authorised'; end if;
  update play_sessions set partner_rotation = p_mode where id = p_session_id;
end;
$$;
grant execute on function set_session_partner_rotation(uuid, text) to authenticated;
