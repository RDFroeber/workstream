-- Migration 003 — related task links
-- Run this in Supabase → SQL Editor if you already ran an earlier schema.sql.
-- (Fresh installs: schema.sql already includes it.)
--
-- Distinct from `dependencies`, which is directed and means "this is blocked by
-- that". A link is undirected and carries no scheduling meaning — it's just
-- "these two are connected, look at them together". Mixing the two in one table
-- would mean one row shape with two different sets of rules.

create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_a_id uuid not null references tasks(id) on delete cascade,
  task_b_id uuid not null references tasks(id) on delete cascade,
  note text default '',
  created_at timestamptz not null default now(),
  constraint no_self_link check (task_a_id <> task_b_id),
  -- Rows are stored with the lower uuid first, so a link can only ever exist
  -- once. Without this A→B and B→A would both be insertable and the task would
  -- show the same relationship twice.
  constraint canonical_order check (task_a_id < task_b_id),
  constraint unique_pair unique (task_a_id, task_b_id)
);

create index if not exists task_links_a_idx on task_links(task_a_id);
create index if not exists task_links_b_idx on task_links(task_b_id);

alter table task_links enable row level security;

create policy "own task_links" on task_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter publication supabase_realtime add table task_links;
