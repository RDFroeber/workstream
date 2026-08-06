-- Migration 004 — "picked for today"
--
-- Adds tasks.focus_date: the day the user shortlisted a task for their Today
-- view. Separate from due_date on purpose — choosing what to work on today
-- must not reschedule anything. The app clears it when the task is completed.
--
-- REQUIRED before deploying app versions that include the Today picks feature:
-- completing any task now writes this column.

alter table tasks add column if not exists focus_date date;
