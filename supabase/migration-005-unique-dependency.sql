-- Migration 005 — one row per blocker
--
-- The picker used to allow choosing an existing blocker again, which listed
-- the same dependency twice. The app now filters those out; this constraint
-- makes the database agree. Duplicate rows are collapsed first (keeping the
-- oldest; ties broken by id so identical timestamps can't strand a pair),
-- otherwise adding the constraint would fail.

delete from dependencies d
using dependencies keep
where d.task_id = keep.task_id
  and d.depends_on_task_id = keep.depends_on_task_id
  and (d.created_at, d.id) > (keep.created_at, keep.id);

alter table dependencies
  drop constraint if exists unique_dependency;
alter table dependencies
  add constraint unique_dependency unique (task_id, depends_on_task_id);
