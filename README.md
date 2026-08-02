# Lines — a workstream tracker for juggling 7+ parallel projects

A small, opinionated tool for exactly the problem you described: several independent
workstreams, each with its own tasks and deadlines, some tasks that must happen in order
and some that are standalone, and occasional dependencies *between* workstreams. Free to
host, syncs across devices, and it's yours to change.

## How it's organized (the three views)

- **Lines (dashboard)** — the portfolio view. One row per workstream ("line"), each with a
  status, a progress track, and just its *next action*. Nothing else. This is on purpose —
  showing every task for every stream at once is exactly what makes things fall through
  the cracks.
- **A line (workstream view)** — drill into one workstream to see everything in it:
  standalone tasks and sequences (ordered steps), each showing what's blocking it if
  anything is.
- **A task or sequence (detail)** — the low-level view. Notes, due date, the full ordered
  checklist if it's a sequence, and dependency links to tasks in *other* lines.
- **Today** — pulls the single next action from every active line into one list, split into
  overdue / due today / next up. This is the "am I forgetting anything" view.
- **Inbox** — a frictionless capture bucket. The floating "Quick capture" button is always
  on screen; anything you jot down lands here until you send it to a line.

## Recurring tasks

Any standalone task or sequence can repeat. The rule is an interval plus a unit (every 2
weeks, every 3 months), and weekly rules can additionally pin specific weekdays (every week
on Mon and Thu).

The part worth understanding is **what the next date is counted from**, because the two
options behave very differently:

- **From its due date** — the task stays on a fixed schedule. Rent due the 1st, paid on the
  5th, is still due the 1st next month. Use this for anything with an external deadline.
- **From when I finish it** — the next one is counted from the day you actually did it.
  Water the plants 5 days after the *last watering*, not 5 days after some date you missed.
  Use this for habits and maintenance.

Two behaviours that follow from this:

- Ticking off a recurring task **rolls it forward instead of filing it away**. It stays on
  your list with a new date. This is deliberate: a daily task would otherwise bury the
  "done" section under 365 near-identical rows. A brief confirmation appears so the tick
  doesn't read as "nothing happened."
- A task on a fixed schedule that you've ignored for a while **advances to a future date**,
  rather than coming back still overdue. Miss a month of a daily task and it returns
  tomorrow, not a month ago.

A **recurring sequence** is a repeating checklist — a monthly close, a release process.
Once every step is ticked, a "Finish this cycle" button resets all the steps to todo and
rolls the sequence's date forward. Individual steps can't repeat on their own; the cycle is
the unit that repeats.

Recurring work is **excluded from a line's progress count**, since it never finishes —
otherwise a line with a weekly task would sit at 0% forever. A line made only of recurring
upkeep shows a dashed track and a repeat count instead of a progress bar.

## Reordering

Everything orderable is drag-and-drop: workstreams on the dashboard, tasks within a
workstream, and steps within a sequence. Drag from the grip handle on the left of each row
— the handle rather than the whole card, so that tapping still opens the item and
touch-scrolling still scrolls the page.

It's keyboard-operable too: tab to a handle, press Space to pick the row up, arrow keys to
move it, Space again to drop.

Each drop rewrites that list's ordering from scratch, which also quietly repairs any
duplicate ordering values left behind by earlier edits.

## Data model

Four tables, all in `supabase/schema.sql`:

- `workstreams` — your lines. Name, color, status.
- `tasks` — standalone tasks, sequence containers, and steps are all rows in this one
  table, distinguished by `item_type` (`standalone` | `sequence` | `step`). A step's
  `parent_id` points at its sequence. This is what makes "steps must happen in order, other
  tasks don't" work without two separate systems. Repeat rules live on the same row
  (`recurrence_unit`, `recurrence_interval`, `recurrence_days`, `recurrence_anchor`); a null
  `recurrence_unit` simply means it doesn't repeat.
- `dependencies` — a row means "this task is blocked by that task." Usually links tasks
  across two different workstreams.
- `inbox_items` — quick-capture, not yet assigned to a line.

Row-level security means every row is only ever visible to the account that created it.

## 1. Set up Supabase (free)

1. Create a free project at [supabase.com](https://supabase.com).
2. In your new project, go to **SQL Editor → New query**, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates the tables and locks them down with
   row-level security.

   *Already ran an earlier version of `schema.sql`?* Run
   `supabase/migration-002-recurring.sql` instead — it adds just the recurrence columns to
   your existing `tasks` table without touching your data.
3. Go to **Project Settings → API**. You'll need the **Project URL** and the **anon public**
   key in the next step.
4. Go to **Authentication → Providers** and make sure Email is enabled (it is by default).
   Optional: under **Authentication → Settings**, turn off "Confirm email" if you don't want
   the email-confirmation step for a single-user app.

## 2. Run it locally

```bash
npm install
cp .env.example .env
# paste your Project URL and anon key into .env
npm run dev
```

Open the local URL it prints, sign up with any email/password, and you're in.

## 3. Deploy

### Option A: Vercel (recommended — simplest for env vars)

1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → New Project → import the repo.
3. Vercel auto-detects Vite. Before deploying, add the two environment variables
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the project's Settings → Environment
   Variables.
4. Deploy. Done — you get a free `*.vercel.app` URL, and it redeploys on every push.

### Option B: GitHub Pages

GitHub Pages only serves static files, so your Supabase keys get baked into the build at
build time (this is fine — the anon key is meant to be public; row-level security is what
actually protects your data).

1. `npm install -D gh-pages`
2. Add to `package.json` scripts: `"deploy": "npm run build && gh-pages -d dist"`
3. `.env` needs to exist locally with your real values before you build.
4. Run `npm run deploy`. Enable Pages for the `gh-pages` branch in your repo settings.

Either way, install it to your phone's home screen from the browser's "Add to Home Screen"
/ "Install app" option for an app-like icon — it's a normal web app, so this works on both
iOS and Android without an app store.

## Notes on the design choices

- **Sequential vs. standalone** lives in one `tasks` table instead of two systems, so a
  dependency, a due date, or a note works the same way whether it's on a standalone task or
  a single step — you're not maintaining two mental models.
- **Cross-workstream dependencies** are deliberately lightweight (just "blocked by") rather
  than a full dependency graph — the point is a visible flag when a line is stuck on
  another line, not a project-management Gantt chart.
- **The dashboard shows one next action per line, not every task** — this is the ADHD-
  friendly piece from your original ask: reduce what's visible at the portfolio level, keep
  the full list one tap away in the workstream view.
- **Realtime sync** (via Supabase's realtime feature) means if you add something on your
  phone, it shows up on your laptop within a second or two, without a manual refresh.

## Tests

```bash
npm test
```

32 tests, and the ones worth knowing about:

- **Recurrence date math** — month-end clamping (Jan 31 + 1 month is Feb 28, not Mar 3),
  the schedule-vs-completion anchor distinction, biweekly rules with specific weekdays, and
  the catch-up behaviour for long-neglected tasks. This is the logic most likely to break
  quietly under edits, so it's covered densely.
- **DOM validity** — asserts no `<button>` ends up nested inside another `<button>`, which
  is invalid HTML that browsers handle unpredictably. Adding drag handles to clickable cards
  is exactly the change that introduces this.
- **Progress accounting** — that recurring upkeep stays out of the completion percentage.

## Extending it

Everything is in `src/components/`, one file per view, using Tailwind utility classes and
`src/lib/api.js` as the only place that talks to Supabase. A few natural next additions if
you want them later: a calendar export (.ics) so due dates land in Google Calendar, a
weekly-review mode that walks you through each line in turn, per-line archiving, or
snoozing a task to a specific day.
