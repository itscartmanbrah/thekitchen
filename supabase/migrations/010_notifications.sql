-- Notifications table
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  body text,
  type text not null, -- 'match_scheduled' | 'match_result' | 'league_announcement'
  data jsonb default '{}',  -- e.g. { match_id, league_id, league_name }
  read boolean default false,
  created_at timestamptz default now()
);

-- Indexes
create index idx_notifications_user_unread on notifications (user_id, read, created_at desc);

-- RLS
alter table notifications enable row level security;

-- Users can only read their own notifications
create policy "Users read own notifications"
  on notifications for select
  using (auth.uid() = user_id);

-- Users can mark their own notifications as read
create policy "Users update own notifications"
  on notifications for update
  using (auth.uid() = user_id);

-- Authenticated users can insert notifications (for client-side creation)
create policy "Auth users insert notifications"
  on notifications for insert
  with check (auth.role() = 'authenticated');

-- Users can delete their own notifications
create policy "Users delete own notifications"
  on notifications for delete
  using (auth.uid() = user_id);
