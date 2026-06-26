-- One-time backfill: the name-sync trigger (063) only fires on future profile
-- saves, so members who edited their profile earlier still show a stale name
-- (e.g. the email-prefix from Google sign-up). Sync every member's existing
-- session_players rows to their current profile name + avatar.

update session_players sp
set display_name = p.display_name,
    avatar_color = coalesce(p.avatar_color, sp.avatar_color)
from profiles p
where sp.user_id = p.id
  and (sp.display_name is distinct from p.display_name
       or sp.avatar_color is distinct from p.avatar_color);
