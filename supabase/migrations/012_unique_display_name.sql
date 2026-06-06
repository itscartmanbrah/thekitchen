-- Nicknames / display names must be unique across all profiles
alter table profiles
  add constraint profiles_display_name_unique unique (display_name);
