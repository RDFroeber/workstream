-- Lines — workstream tracker schema
-- Safe to run more than once: Dashboard → SQL Editor → New query → paste → Run.
-- Existing deployments: run the migration-*.sql files (in order) instead.

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
  -- "picked for today": the day the user shortlisted this task. Separate from
  -- due_date on purpose — choosing today's priorities must not reschedule.
  focus_date date,
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
  constraint no_self_dependency check (task_id <> depends_on_task_id),
  -- the same blocker listed twice is noise, not information
  constraint unique_dependency unique (task_id, depends_on_task_id)
);

-- ---------------------------------------------------------------------------
-- task_links: "these two are related", undirected and non-blocking
--
-- Deliberately separate from `dependencies`. A dependency is directed and
-- affects what you can start; a link is symmetric and affects nothing except
-- what you want to see together.
-- ---------------------------------------------------------------------------
create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_a_id uuid not null references tasks(id) on delete cascade,
  task_b_id uuid not null references tasks(id) on delete cascade,
  note text default '',
  created_at timestamptz not null default now(),
  constraint no_self_link check (task_a_id <> task_b_id),
  -- lower uuid first, so a pair can only exist once in one direction
  constraint canonical_order check (task_a_id < task_b_id),
  constraint unique_pair unique (task_a_id, task_b_id)
);

create index if not exists task_links_a_idx on task_links(task_a_id);
create index if not exists task_links_b_idx on task_links(task_b_id);

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
alter table task_links enable row level security;
alter table inbox_items enable row level security;

drop policy if exists "own workstreams" on workstreams;
create policy "own workstreams" on workstreams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own tasks" on tasks;
create policy "own tasks" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own dependencies" on dependencies;
create policy "own dependencies" on dependencies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own task_links" on task_links;
create policy "own task_links" on task_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own inbox_items" on inbox_items;
create policy "own inbox_items" on inbox_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime — lets a second open device see changes live
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table workstreams;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table dependencies;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table task_links;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table inbox_items;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Reordering in one round-trip.
-- `updates` is a JSON array of { "id": uuid, "sort_order": int }. RLS applies
-- (security invoker), so rows the caller doesn't own are silently untouched.
-- ---------------------------------------------------------------------------
create or replace function reorder_tasks(updates jsonb)
returns void
language sql
as $$
  update tasks t
  set sort_order = (u->>'sort_order')::int
  from jsonb_array_elements(updates) u
  where t.id = (u->>'id')::uuid;
$$;

create or replace function reorder_workstreams(updates jsonb)
returns void
language sql
as $$
  update workstreams w
  set sort_order = (u->>'sort_order')::int
  from jsonb_array_elements(updates) u
  where w.id = (u->>'id')::uuid;
$$;
