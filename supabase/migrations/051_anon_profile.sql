-- Anonymous sign-ins (used by no-login Open Play) create an auth.users row with
-- NO email. The handle_new_user trigger inserted new.email into profiles.email
-- (NOT NULL) and derived display_name from the email — both NULL for anon users,
-- so the insert failed and Supabase returned 500 on /auth/v1/signup.
--
-- Make the trigger anon-safe: empty-string email, and a guaranteed-unique
-- display_name fallback (profiles.display_name is UNIQUE — see migration 012,
-- so a constant like 'Guest' would collide on the 2nd anonymous user).

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, display_name, avatar_color)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Guest-' || replace(new.id::text, '-', '')   -- unique per user
    ),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#16a34a')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
