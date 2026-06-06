-- Add player registration fields to profiles
alter table profiles
  add column if not exists first_name  text not null default '',
  add column if not exists last_name   text not null default '',
  add column if not exists nickname    text,
  add column if not exists birthday    date,
  add column if not exists phone       text;

-- Back-fill existing rows: split display_name into first/last where possible
update profiles
set
  first_name = split_part(display_name, ' ', 1),
  last_name  = case
    when position(' ' in display_name) > 0
    then substring(display_name from position(' ' in display_name) + 1)
    else ''
  end
where first_name = '';

-- Update the trigger so new signups get first/last from metadata
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (
    id, email,
    first_name, last_name, nickname, birthday, phone,
    display_name, avatar_color
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    nullif(new.raw_user_meta_data->>'nickname', ''),
    nullif(new.raw_user_meta_data->>'birthday', '')::date,
    nullif(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#16a34a')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
