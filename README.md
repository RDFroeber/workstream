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
  overdue / due today / next up. This is the "am I forgetting anything" view. At the top
  sit your **picks for the day**: tap the sun on any task — here, in a line, or in the
  task detail — to shortlist it for today *without touching its due date*. Picking is
  prioritizing, not rescheduling. Picks clear themselves when the task is done, and
  unfinished ones carry over (labelled) rather than vanishing at midnight.
- **Inbox** — a frictionless capture bucket. The floating "Quick capture" button is always
  on screen; anything you jot down lands here until you send it to a line.

## Signing in

Email and password, with a reset flow. Following a reset link signs you in on a
temporary session and lands you on a "set a new password" screen — Supabase
treats the link as an authentication, so without intercepting the
`PASSWORD_RECOVERY` event you'd be dropped into the app with the forgotten
password still set.

The reset request reports the same message whether or not the address has an
account, so the form can't be used to discover which addresses are registered.

Both the confirmation and reset links are sent back to `appUrl()` — the
directory this copy of the app is served from — so they work from local dev and
the deployed copy alike, provided both are in the Supabase **Redirect URLs**
allow list.

Sign in with Apple is offered as a second option. There's deliberately no Google
sign-in: guideline 4.8 only triggers on a third-party or social login, and Sign
in with Apple is the option that *satisfies* it rather than one that creates the
obligation. See `docs/app-store.md`.

## Search

⌘K or Ctrl-K, or the magnifier in the header. Searches task titles, notes and
line names across everything, including steps inside sequences and completed
work.

Matching is substring-and-prefix, not fuzzy, on purpose. Fuzzy matching demos
well and wears badly: it returns results you can't explain, and past a couple of
hundred tasks the "why is that first?" moment costs more than the occasional
typo it rescues. Ranking is exact title > title prefix > start of any word >
anywhere in the title > notes, with completed work pushed below open work and
ties broken by due date so a repeated search doesn't reshuffle.

Queries are matched with accents stripped, so `cafe` finds `café` — typing the
unaccented form is the common case and failing to match it reads as the search
being broken.

## Getting your data out

Settings offers two downloads:

- **JSON** — every line, task, dependency, link and inbox item, with ids intact,
  so the relationships between them survive. This is the backup.
- **CSV** — the tasks flattened for a spreadsheet, with relationships spelled
  out as names rather than ids. Easier to read, and deliberately lossy: it is
  not a complete backup, and the panel says so.

Nothing here is locked in. The CSV is written with CRLF endings and a byte order
mark because it exists to be opened in Excel, which misreads plain UTF-8.

## When something breaks

An error boundary wraps the whole app, so a render error shows an explanation
instead of a white screen. It sits outside the theme provider — if that throws,
something still has to catch it — and its styling comes from the CSS variables on
`<html>` rather than from React context, so the fallback renders either way.

It offers, in order: try again, reload, **download a copy of your data**, and as
a last resort clear the cached copy. The download matters more than it looks:
when the app can't render, the export in Settings is unreachable, which is
exactly when you'd want your data. It reads the cached snapshot rather than live
state, since live state is what just failed.

Worth knowing what a boundary does not catch: errors inside event handlers, in
async code, or thrown by the boundary itself. Those still go to the console.

## Updating a deployed copy

The service worker uses `registerType: 'autoUpdate'`, so a new build takes over
on the next load. This matters more than it sounds: with the plugin's default
(`'prompt'`) the new worker calls `skipWaiting()` only when it receives a message
from `updateSW()`, which you raise from an `onNeedRefresh` handler. Without that
handler the new worker installs, waits, and never activates — every visitor stays
pinned to whichever build they first loaded, and no deploy ever reaches anyone.

If you're testing a deploy and still seeing an old build, that's the thing to
check first. A hard reload, or unregistering the worker in devtools, clears a
copy stuck from before this was fixed.

## Offline

The app keeps working with no connection, in two separate ways.

**Reads.** A service worker precaches the shell, so opening Lines offline shows
the app rather than the browser's error page. Every successful load is also kept
as a snapshot in `localStorage`, so your lines are there — with a banner saying
how stale the data is, rather than pretending it's live. Supabase requests are
explicitly `NetworkOnly`: caching API responses would mean serving stale task
data that *looks* current, which is worse than an honest error.

**Writes.** Edits made offline are applied to the local data immediately and
queued in a durable outbox, then replayed in order when the connection returns.
Order is enforced — a task created offline and then renamed has to be created
first — so a failure stops the queue rather than skipping ahead. A write the
server permanently rejects (a 4xx) is dropped and reported instead of wedging
the queue forever; a transient failure leaves everything queued for the next
attempt.

Not solved: multi-device conflict resolution. This is a single-user app and the
server is last-write-wins, so two devices editing the same task offline resolve
to whichever syncs last.

## Reminders

Opt-in, in Settings: a daily summary at a time you choose of what's overdue or
due today, and optionally a nudge per task. Reminders fire once per task per day
— the loop ticks every minute, so without that the summary would fire sixty
times an hour.

**These are local notifications, not push.** There's no server, so Lines can
only raise a notification while its page or service worker is alive: open in a
tab, recently backgrounded, or the next time you open it. It will not reach you
if the app has been closed for two days. That needs Web Push with a VAPID
server, which is separate infrastructure this app doesn't run. Installing to
your home screen makes them noticeably more reliable. The settings panel says
all of this rather than letting you find out by missing something.

## Layouts

The header is deliberately identical on every tab: logo, the three sections, and
the theme/settings/sign-out controls. Nothing in it depends on which view you're
looking at, and it's laid out as a three-column grid so the nav sits in the
centre regardless of what the outer groups contain. `justify-between` only
centres the middle item when the two outer groups happen to be the same width,
which is why the layout switcher living in the bar made the nav slide sideways
between tabs.

The switcher itself sits on the dashboard, next to "New line" — beside the thing
it controls, and only on the page where it applies.

### The views

On a phone the stacked list is the whole story. From tablet width up, a switcher
in the header offers three more ways to see the same lines — the choice is
remembered, and it always collapses back to the list below 768px regardless of
what's saved.

- **List** — the original. One line per row, showing only its next action. Still
  the best view for "what now?"
- **Grid** — the same cards two or three across, with room for the next few
  actions per line instead of only one. The overview, when you have the width
  for it.
- **Timeline** — every dated task on a shared two-week axis, one track per line.
  This is the only view that can answer "is anything about to collide?" — the
  list and Today both sort by urgency, which hides the fact that four things
  land on the same Wednesday. Days where three or more lines come due are
  highlighted. Undated work doesn't appear here, and the view says so rather
  than quietly omitting it.
- **Split** — every line in a rail on the left, the open one beside it. Keeps
  the three-tier structure but collapses the top two onto one screen, so you're
  not paying the click-back-click-forward tax all day.

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

## Line colors

24 colors across 8 hue families. They aren't arbitrary — the palette was built
against a few constraints, and `npm test` enforces all of them so future edits
can't quietly break it:

- Every color clears 3:1 contrast against the white panel, so the progress
  marker stays visible — with exactly one flagged exception, below.
- Every color sits near L\* 45–58, so no line visually shouts louder than the
  others on the dashboard.
- Every pair is separated well past the just-noticeable threshold. The tightest
  remaining pairs are Navy / Indigo and Violet / Purple, adjacent shades within a
  family that are meant to read as related rather than identical.

**Amber is a deliberate exception.** It's the palette's only true yellow, and a
true yellow can't clear 3:1 on white — pure yellow manages 1.23:1, school-bus
yellow 1.43:1. Amber sits at 2.61:1, breaking both the contrast floor and the
lightness band on purpose. It's marked `lowContrast` in the palette so the
invariant tests permit exactly this one and nothing else, and so the UI can
compensate: anything filled with a flagged color gets a faint dark inset
outline to hold its edge. No other color carries that outline, so it never
becomes ambient noise.

One retired color to be aware of: the original Green was a teal-green that sat
too close to Seafoam, so Green now uses what was previously Lime's hex and a
brighter, yellower Lime was added in its place. Any line still holding the old
`#1E8A6E` keeps rendering and shows up in the picker as "Current" — nothing
breaks, it just isn't offered to new lines.

**New lines get colors automatically**, in an order computed by a max-min search
over perceptual distance measured simultaneously under normal vision and all
three types of color blindness. So if you never touch the color picker, your
first eight workstreams still end up maximally distinguishable rather than
drifting into adjacent hues.

**The "high-contrast set" toggle** in the picker narrows to eight colors that
stay tellable apart under deuteranopia, protanopia and tritanopia. Past about
eight, that guarantee is mathematically impossible — dichromatic vision collapses
the color space — so the toggle is honest about the limit rather than pretending
all 24 work for everyone.

The picker draws any color another line is already using as a ring rather than a
solid dot,
since two workstreams in near-identical colors is what actually makes the
dashboard hard to scan.

## Dark mode

Three settings in the header: light, dark, or follow the OS (the default). The
choice is stored in `localStorage` and applied by a small inline script in
`index.html` before React mounts, so a dark-mode user never gets a white flash
on load.

Every colour in the UI is a CSS variable declared in `src/index.css`, as
space-separated RGB channels so Tailwind's alpha modifiers (`bg-ink/30`) keep
working across both themes. A test asserts no component contains a literal hex
or a light-only Tailwind class, since one stray `bg-white` is a white block in
dark mode.

The line palette needed real work rather than a filter. Twelve of the 24 light
colours fall below 3:1 contrast on a dark panel — Graphite manages 1.59:1 — so
half the palette would have effectively disappeared. Each colour therefore
carries a `dark` variant, solved under the same constraints as the light set:
at least 3.5:1 on the dark panel, every pair still separated, the eight-colour
safe subset still safe under all three dichromacies, and hue held within 22
degrees so "Navy" stays a navy rather than optimising itself into lavender. The
database always stores the light hex; the variant is swapped in at render time.

## Installing it on your phone

It's a proper PWA, so "Add to Home Screen" gives you an icon called **Lines**
that opens fullscreen with no browser chrome.

- **iOS**: Safari → Share → Add to Home Screen. Safari ignores the web manifest
  for both the icon and the name, so those come from `apple-touch-icon.png` and
  the `apple-mobile-web-app-title` meta tag instead — both are set.
- **Android**: Chrome will offer an install prompt, or use the menu → Install
  app. This uses `manifest.webmanifest`, including a maskable icon so Android
  can crop it to whatever shape the launcher uses without clipping the artwork.

The icon is the same waypoints mark the header uses — four nodes joined by two
diagonals and a horizontal run. Run `python3 scripts/make-icons.py` (needs
`cairosvg`) to regenerate everything after editing it; add `--light` for a
dark-ink-on-white icon instead of the inverted default.

The mark can't simply be scaled down for the favicon. At its native stroke
weight the ring holes come out around half a device pixel at 16px and the
rasteriser fills them in, so the whole thing renders as a solid cross. The
favicon build thins the stroke and scales the mark up to keep every hole open,
and drops the coloured accent node, which rasterises lighter than the white ones
at that size and reads as a fault. Tests assert the topology and stroke weight
so a future edit can't quietly turn it back into a blob.

## Notes

Notes are a plain text field, and any http or https address in them is rendered
as a clickable chip underneath. The text stays a normal editable textarea rather
than switching to a preview mode, so links are usable without there being an
edit state to get stuck in. Only http and https are ever turned into links —
`javascript:`, `data:` and `file:` are dropped, since these strings come from a
user field and end up as href attributes.

Title and notes are written back on blur *and* on unmount. React doesn't fire
blur when a focused element is removed, so committing only on blur meant closing
with Escape, or clicking through to a step, silently discarded the edit.

## Related links

Any two tasks can be linked as related — across lines or within one. This is
deliberately *not* a dependency: a link carries no scheduling meaning, doesn't
block anything, and never shows up as a red flag on the dashboard. It exists so
that "the vendor contract" and "the budget sign-off" can point at each other
without one pretending to gate the other.

Links are undirected, and stored that way: rows go into `task_links` with the
lower uuid first, under a unique constraint, so linking A to B and later B to A
can't produce two rows describing the same relationship. Both ends see the link;
already-linked tasks are filtered out of the picker rather than being offered
and then rejected by the database.

Visually they stay quiet — a plain chain icon and a count on the task row, no
colour. Blockers keep the red styling to themselves, because a warning that
appears for non-warnings stops working.

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
- `dependencies` — a row means "this task is blocked by that task." Directed, and
  usually links tasks across two different workstreams.
- `task_links` — a row means "these two are related." Undirected and non-blocking,
  stored in a canonical order so a pair can only exist once.
- `inbox_items` — quick-capture, not yet assigned to a line.

Row-level security means every row is only ever visible to the account that created it.

## 1. Set up Supabase (free)

1. Create a free project at [supabase.com](https://supabase.com).
2. In your new project, go to **SQL Editor → New query**, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates the tables and locks them down with
   row-level security.

   *Already ran an earlier version of `schema.sql`?* Run the `supabase/migration-*.sql`
   files you haven't run yet, in order, instead — each adds just its columns or
   constraints without touching your data:

   - `migration-002-recurring.sql` — recurrence columns
   - `migration-003-task-links.sql` — the `task_links` table
   - `migration-004-focus-date.sql` — the "picked for today" flag. **Required** for
     current app versions: completing a task writes this column.
   - `migration-005-unique-dependency.sql` — collapses duplicate blockers and prevents
     new ones. Recommended.
   - `migration-006-reorder.sql` — reorders a list in one round-trip instead of one
     request per row. Optional: the app falls back automatically when it's missing.
3. Go to **Project Settings → API**. You'll need the **Project URL** and the **anon public**
   key in the next step.
4. Go to **Authentication → Providers** and make sure Email is enabled (it is by default).
   Optional: under **Authentication → Settings**, turn off "Confirm email" if you don't want
   the email-confirmation step for a single-user app.
5. **If you leave email confirmation on, set your URLs** under **Authentication → URL
   Configuration**, or the confirmation links will point at `http://localhost:3000`:
   - **Site URL** — where the app really lives, e.g.
     `https://yourname.github.io/workstream/`
   - **Redirect URLs** — add the same URL, plus `http://localhost:5173/` for local
     development. Supabase only honours a redirect that appears in this allow list; anything
     else silently falls back to the Site URL.

   The app already asks for a redirect back to whatever address it's being served from, so
   once both URLs are listed, confirmation works from local dev and from the deployed copy
   without further changes.

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

`gh-pages` and the `deploy` script are already set up, so:

1. Make sure `.env` exists locally with your real values — the build inlines them.
2. `npm run deploy`
3. Enable Pages for the `gh-pages` branch in your repo settings.

A note on paths: Vite ignores the `homepage` field — that's a Create React App
convention. What actually matters is `base: './'` in `vite.config.js`, which makes every
asset path relative. That's why this works from a project subpath like `/workstream/`
without hard-coding the repo name, and why the manifest's `start_url` and `scope`, and the
service worker's scope, all resolve correctly under it too.

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
npm test          # run once
npm run coverage  # with a coverage report
```

617 tests, at 93% statement and 91% branch coverage. `src/lib` — where the logic
that can silently lose data lives — is at 92%, and the API layer at 99%.

What deliberately isn't covered, and why:

- **The real Supabase client.** `supabaseClient.js` is a thin env-var shim, and
  the API layer is tested against a mock of the query builder. Whether the real
  service honours the row-level security policies is a thing to verify against a
  real project, not in jsdom.
- **The service worker at runtime.** Its configuration is asserted; its actual
  caching behaviour needs a browser.
- **Drag gestures.** dnd-kit's lifecycle needs pointer events and layout
  measurement, so the drop *calculation* was pulled out into `reorderOnDrop` and
  tested directly, while the gesture itself is not.
- **Anything visual.** Contrast and palette maths are tested numerically, but
  whether it looks right is not something a test can tell you.

The tests worth knowing about:

- **Recurrence date math** — month-end clamping (Jan 31 + 1 month is Feb 28, not Mar 3),
  the schedule-vs-completion anchor distinction, biweekly rules with specific weekdays, and
  the catch-up behaviour for long-neglected tasks. This is the logic most likely to break
  quietly under edits, so it's covered densely.
- **DOM validity** — asserts no `<button>` ends up nested inside another `<button>`, which
  is invalid HTML that browsers handle unpredictably. Adding drag handles to clickable cards
  is exactly the change that introduces this.
- **Progress accounting** — that recurring upkeep stays out of the completion percentage.
- **Dark palette** — that every dark variant is readable on the dark panel, doesn't
  glare, stays separable, and keeps its hue. Plus a guard that no component contains a
  hardcoded colour.
- **Unsaved edits** — that notes and title survive Escape, navigating to a step, and any
  other unmount, and that a normal blur followed by unmount doesn't write twice.
- **Offline ids** — that a row created offline and then edited keeps its edits: the
  temporary id is swapped for the server's in everything queued behind it.
- **Offline** — that the optimistic reducer mirrors what the server would do for every
  operation, that the outbox replays in order, stops at a transient failure, and drops a
  permanently rejected write rather than blocking forever.
- **Reminders** — that a sequence surfaces only its current step, that nothing fires
  before the chosen time, and that repeated ticks don't re-notify.
- **Related links** — that a pair normalises the same way from either direction, that
  both ends of a link can see it, and that related links don't borrow the blocker's
  red styling.
- **Layouts** — that the grid really does show more than one upcoming action, that the
  timeline flags a crunch day and stays quiet on a calm week, that the split view keeps a
  valid selection when a line is deleted, and that everything falls back to the list below
  the tablet breakpoint.
- **Logo mark** — that the icon keeps the header glyph's exact coordinates and stays
  drawn as open rings, since that's the property that fails first at small sizes.
- **PWA assets** — that the icons exist, the manifest names the app Lines, paths are
  relative so it works on a subpath host, and the iOS-specific tags are present.
- **Palette guarantees** — contrast, lightness consistency, pairwise separation, and
  that the colorblind-safe subset really is safe under all three dichromacies. The math
  lives in `tests/colorScience.js` (CIEDE2000 + Viénot dichromat simulation), kept out of
  `src/` since the app has no runtime need for it.

## Extending it

Everything is in `src/components/`, one file per view, using Tailwind utility classes and
`src/lib/api.js` as the only place that talks to Supabase. A few natural next additions if
you want them later: a calendar export (.ics) so due dates land in Google Calendar, a
weekly-review mode that walks you through each line in turn, per-line archiving, or
snoozing a task to a specific day.
