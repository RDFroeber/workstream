-- Migration 006 — reorder in one round-trip
--
-- Dragging a task previously issued one UPDATE per row, in parallel — n
-- requests, and a half-reordered list if any one of them failed. These
-- functions apply the whole new ordering in a single statement.
--
-- Optional: the app falls back to per-row updates when these functions are
-- missing, so nothing breaks without this migration — it's just slower.
--
-- security invoker (the default), so row level security applies: rows the
-- caller doesn't own are silently left untouched.

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
