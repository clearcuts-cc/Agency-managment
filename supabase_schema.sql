-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. USERS TABLE
create table public.users (
  id uuid references auth.users not null primary key,
  email text unique not null,
  name text,
  avatar text,
  role text default 'Employee',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.users enable row level security;

-- Policies
create policy "Public profiles are viewable by everyone" on public.users
  for select using (true);

create policy "Users can insert their own profile" on public.users
  for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

-- 2. CLIENTS TABLE
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id), -- Owner/Creator
  name text not null,
  email text,
  phone text,
  company text,
  projects text[], -- Array of strings
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.clients enable row level security;

create policy "Users can view clients" on public.clients for select using (true);
create policy "Users can insert clients" on public.clients for insert with check (auth.role() = 'authenticated');
create policy "Users can update clients" on public.clients for update using (auth.role() = 'authenticated');

-- 3. TASKS TABLE
create table public.tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id),
  client_id uuid references public.clients(id),
  title text not null,
  project text,
  stage text check (stage in ('Post', 'Script', 'Shoot', 'Edit', 'Ads', 'Meeting')),
  status text check (status in ('Pending', 'In Progress', 'Done')),
  assignee text,
  priority text default 'Medium',
  deadline timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.tasks enable row level security;

create policy "Users can view all tasks" on public.tasks for select using (true);
create policy "Users can create tasks" on public.tasks for insert with check (auth.role() = 'authenticated');
create policy "Users can update tasks" on public.tasks for update using (auth.role() = 'authenticated');
create policy "Users can delete tasks" on public.tasks for delete using (auth.role() = 'authenticated');
