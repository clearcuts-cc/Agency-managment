-- MODIFICATIONS TO EXISTING SCHEMA

-- 1. Updates to CLIENTS table
-- Add status column regarding approval
alter table public.clients 
add column if not exists status text default 'Approved';

-- 2. New NOTIFICATIONS table
create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id), -- Recipient
  type text, -- 'task_assigned', 'client_approval', etc.
  message text not null,
  is_read boolean default false,
  related_id uuid, -- ID of the task or client
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Notifications
alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "System/Admins can insert notifications" on public.notifications;
create policy "System/Admins can insert notifications" on public.notifications
  for insert with check (true); -- Allow all authenticated to insert (e.g. employee triggers notification for admin)

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications" on public.notifications
  for update using (auth.uid() = user_id);

-- 3. Enhance Tasks Table
-- Add assignee_id for robust user linking
alter table public.tasks 
add column if not exists assignee_id uuid references auth.users(id);

-- 4. User Profile Triggers
-- Automatically create a public.users profile when a new Auth user is created
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.users (id, email, name, role, avatar)
  values (
    new.id, 
    new.email, 
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'Employee'), -- Default role
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger the function every time a user is created
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
