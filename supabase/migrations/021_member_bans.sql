-- League member bans
--
-- Lets a league admin (head_admin/admin) ban a member with a reason.
-- A banned member:
--  - is hidden from the active members list / leaderboard / matches (filtered by status='active')
--  - sees a "you are banned" screen instead of the league when they open it
--  - cannot rejoin via invite code while banned

alter table league_members
  add column if not exists ban_reason text,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_by uuid references auth.users(id);

alter table league_members drop constraint if exists league_members_status_check;
alter table league_members add constraint league_members_status_check
  check (status in ('active', 'pending', 'invited', 'banned'));

-- ── ban_league_member ─────────────────────────────────────────────────────
create or replace function ban_league_member(p_member_id uuid, p_reason text)
returns void
language plpgsql
security definer
as $$
declare
  v_member record;
begin
  select * into v_member from league_members where id = p_member_id;
  if not found then
    raise exception 'Member not found';
  end if;

  if not is_league_admin(v_member.league_id) then
    raise exception 'Not authorised to ban members in this league';
  end if;

  if v_member.user_id = auth.uid() then
    raise exception 'You cannot ban yourself';
  end if;

  if v_member.role = 'head_admin' then
    raise exception 'The head admin cannot be banned';
  end if;

  update league_members
  set status      = 'banned',
      ban_reason  = nullif(trim(p_reason), ''),
      banned_at   = now(),
      banned_by   = auth.uid()
  where id = p_member_id;
end;
$$;

-- ── unban_league_member ───────────────────────────────────────────────────
create or replace function unban_league_member(p_member_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_member record;
begin
  select * into v_member from league_members where id = p_member_id;
  if not found then
    raise exception 'Member not found';
  end if;

  if not is_league_admin(v_member.league_id) then
    raise exception 'Not authorised to unban members in this league';
  end if;

  if v_member.status <> 'banned' then
    raise exception 'This member is not banned';
  end if;

  update league_members
  set status      = 'active',
      ban_reason  = null,
      banned_at   = null,
      banned_by   = null
  where id = p_member_id;
end;
$$;
