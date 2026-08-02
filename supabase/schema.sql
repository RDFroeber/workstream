-- Lines — workstream tracker schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- workstreams: the 7+ parallel "lines"
-- ---------------------------------------------------------------------------
create table if not exists workstreams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#2C7BE5',
  status text not null default 'active' check (status in ('active','at_risk','blocked','done','archived')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks: standalone tasks, sequence containers, and steps (children of a sequence)
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workstream_id uuid not null references workstreams(id) on delete cascade,
  parent_id uuid references tasks(id) on delete cascade,
  item_type text not null default 'standalone' check (item_type in ('standalone','sequence','step')),
  title text not null,
  notes text default '',
  status text not null default 'todo' check (status in ('todo','doing','done')),
  due_date date,
  sort_order int not null default 0,
  -- recurrence: null recurrence_unit means "does not repeat"
  recurrence_unit text check (recurrence_unit in ('day','week','month','year')),
  recurrence_interval int not null default 1,
  recurrence_days int[],                    -- 0=Sun..6=Sat, only used when unit='week'
  recurrence_anchor text not null default 'schedule'
    check (recurrence_anchor in ('schedule','completion')),
  recurrence_count int not null default 0,  -- how many times it's been completed
  last_completed_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_workstream_idx on tasks(workstream_id);
create index if not exists tasks_parent_idx on tasks(parent_id);

-- ---------------------------------------------------------------------------
-- dependencies: task A is blocked by task B (usually across workstreams)
-- ---------------------------------------------------------------------------
create table if not exists dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  note text default '',
  created_at timestamptz not null default now(),
  constraint no_self_dependency check (task_id <> depends_on_task_id)
);

-- ---------------------------------------------------------------------------
-- inbox_items: frictionless capture, triaged into a workstream/task later
-- ---------------------------------------------------------------------------
create table if not exists inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security — every row is only visible/editable by its owner
-- ---------------------------------------------------------------------------
alter table workstreams enable row level security;
alter table tasks enable row level security;
alter table dependencies enable row level security;
alter table inbox_items enable row level security;

create policy "own workstreams" on workstreams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tasks" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own dependencies" on dependencies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own inbox_items" on inbox_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime — lets a second open device see changes live
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table workstreams;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table dependencies;
alter publication supabase_realtime add table inbox_items;
