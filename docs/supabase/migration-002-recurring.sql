-- Migration 002 — recurring tasks
-- Run this in Supabase → SQL Editor if you already ran schema.sql.
-- (If you're setting up fresh, schema.sql already includes all of this.)

alter table tasks add column if not exists recurrence_unit text
  check (recurrence_unit in ('day','week','month','year'));
alter table tasks add column if not exists recurrence_interval int not null default 1;
alter table tasks add column if not exists recurrence_days int[];
alter table tasks add column if not exists recurrence_anchor text not null default 'schedule'
  check (recurrence_anchor in ('schedule','completion'));
alter table tasks add column if not exists recurrence_count int not null default 0;
alter table tasks add column if not exists last_completed_at timestamptz;
