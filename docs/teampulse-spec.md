# TeamPulse — decisions, metrics and rules

Phase 0 output. Every number the UI shows is defined here. If a screen shows a
value that is not in this file, the screen is wrong.

TeamPulse is a **module inside SelfTrack**, not a separate app:

- routes live under `/tp/*`
- tables are prefixed `tp_`
- it reuses SelfTrack's `users`, `sessions`, `lib/auth.js` and Supabase storage
- its API lives in `api/tp/[...path].js`, separate from the legacy router

## 1. People vs users

A **person** (`tp_person`) is someone whose delivery, attendance and skills are
tracked. A **user** (`users`) is someone who can sign in. Most people will never
sign in, and some users (an admin) are not tracked people. `tp_person.user_id`
links the two when both exist, and is nullable.

Team size counting rule: "team members" = active people in the manager's tree
**including** the manager. "Direct reports" = active people whose `manager_id`
is the manager, **excluding** the manager. The design export mixed these (12 vs
11); this rule settles it.

## 2. Roles and access

Roles reuse the `users.role` column, mapped as:

| `users.role` | TeamPulse role |
|---|---|
| `admin` | admin |
| `moderator` | manager |
| `user` | member |
| `spectator` | spectator |

| Data | admin | manager (own tree) | member (self) | spectator |
|---|---|---|---|---|
| People list | all | own tree | own row | name + role only |
| Delivery / tasks | all | own tree | own tasks | aggregates only |
| Attendance, late logins | all | own tree | self | none |
| Feedback | all | own tree | self (score + comment) | none |
| Private notes | none | own authored only | none | none |
| Skills | all | own tree, edits manager rating | self rating only | read levels |
| Config, targets, catalog | all | none | none | none |

Rules:

- enforced **server side, per row**. Hiding a nav link is not access control.
- a manager's "tree" is the transitive closure of `manager_id`, depth-limited to
  10 to stop a cycle from hanging a query.
- every read of another person's attendance or feedback writes a `tp_audit` row
  with action `read.attendance` / `read.feedback`.
- a member can always read their own full record, including which attention
  signals fired and why. That is a legal requirement, not a nice-to-have.

## 3. Metric definitions

All metrics take a period `[from, to)` and a scope (team or person). Where the
denominator is zero the API returns `null` and the UI renders `—`. Never `NaN`,
never `0%`.

### On-time completion
```
numerator   = tasks with completed_at::date <= due_date, completed in period
denominator = tasks completed in period + tasks still open whose due_date < today
```
An open overdue task counts against the person. Cancelled tasks are excluded
entirely. Reopening a task removes its earlier on-time credit; the reopened task
is judged on its final completion.

### Average client score
```
avg(tp_feedback.score) where source = 'client' and given_on in period
```
Scale 1–5, one decimal. Peer and leadership feedback are stored but excluded
from this KPI. A person with no client feedback in the period shows `—`.

### Effort over estimate
```
sum(actual_hours) / sum(est_hours) - 1, over tasks completed in period
```
Tasks with `est_hours` null or 0 are excluded from both sums.

### Reopen rate
```
tasks with reopened_count > 0, completed in period / tasks completed in period
```
`reopened_count` is derived from `tp_task_event` (a `done -> not done`
transition), never typed in by hand.

### Defects leaked to UAT
Count of tasks with `leaked_to_uat = true` whose `completed_at` is in the
period. Set by whoever triages the UAT defect, not by the task owner.

### Overdue tasks
Open tasks (`status not in (done, cancelled)`) with `due_date < today`.
"Aged" = `today - due_date` in working days, not calendar days.

### Task aging buckets
`0-2`, `3-5`, `6-10`, `10+` working days past `due_date`, open tasks only.

### Attendance rate
```
(working_days - unplanned_days - sick_days) / working_days
```
`working_days` comes from `tp_holiday` plus the Mon–Fri calendar for the
person's region, **not** a hardcoded 21. Planned leave does not reduce the
attendance rate; unplanned and sick do, and are reported separately so the two
can be split later without a migration.

### Late logins
A `tp_attendance` row with `minutes_late > 0`. `minutes_late` is **derived**
from the recorded login time and the shift start in `tp_config.shift_start`
(default `09:30` per region). The form shows it read-only. The design let both
the time and the minutes be typed, which lets them disagree.

### Overtime hours
Sum of `tp_overtime.hours` in the period. **This needs a source.** Until a
timesheet feed or manual entry exists, the overtime KPI renders `—` and the
overtime attention signal never fires. It is not estimated or guessed.

### Utilization
```
billable_hours / (working_days * hours_per_day - planned_leave_hours)
```
Same dependency as overtime: no hours source, no utilization. Hidden until
there is one, rather than shown as a made-up number.

### Experience
`total_exp_months` and `relevant_exp_months` are manually maintained fields on
the person, displayed in years to one decimal. Invariant:
`relevant_exp_months <= total_exp_months`, enforced at write time.

## 4. Attention rule

Stored in `tp_config` under key `attention`, so it is tunable without a deploy.
Each signal compares the last 30 days against the person's own trailing 90-day
baseline — comparing people against each other punishes whoever has the harder
project.

```
ontime_drop      on_time_pct  < baseline - 10pp   OR  on_time_pct < target
score_drop       client_score < baseline - 0.5
unplanned        unplanned_days >= 3 in trailing 90 days
overtime         overtime_hours > 20/month for 2 consecutive months
overdue          >= 2 open tasks aged more than 5 working days
```

```
>= 3 signals  -> At risk
   2 signals  -> Watch
   < 2        -> On track
overtime signal alone, no others -> Overtime
overtime + any one other                -> Burnout watch
```

A signal needs data to fire. A person with no client feedback does not get a
`score_drop` signal; missing data never counts as a bad signal.

Status is **manager-visible only** and always shown with the list of signals
that produced it. A person can see their own status and signals. A status can be
overridden by the manager via `tp_person.status_override` with a required
reason, which is audited.

## 5. Capture rules

- **Attendance is one row per person per day.** `unique (person_id, date)`.
  Logging over an existing day requires an explicit overwrite confirmation and
  keeps the old value in `tp_audit`.
- A multi-day absence expands into one row per **working** day, skipping
  weekends and holidays.
- Nothing can be logged on a date before the person's `date_joined_org` or more
  than 90 days in the future.
- Every entry is editable and deletable by its author or an admin, and every
  edit is audited with before/after. The design's "visible to you only, logged
  in the audit trail" was a contradiction: entries are **audited records**, and
  only free-text `tp_note` rows are manager-private.
- Concurrent edits use optimistic locking on `updated_at`. A stale write returns
  409 with the current row, not a silent overwrite.

## 6. Validation rules

Client-side checks are UX only. The server re-validates everything below and is
the only authority.

| Entity | Rule |
|---|---|
| person | name 2–80 chars; `relevant_exp_months <= total_exp_months`; `allocation_pct` 0–100; `manager_id` not self and no cycle in the chain; designation from enum |
| task | title 3–200; `due_date >= created_at::date`; `est_hours` 0–500; `actual_hours >= 0`; `progress_pct` 0–100 integer; `done` forces 100 and requires `completed_at`; `blocked` requires a note; owner must be an active person |
| attendance | date required, not before join date, not beyond today+90; weekend/holiday rejected unless `force`; `minutes_late` 0–480, over 240 requires a note; type from enum |
| leave | `days` 1–30; planned leave beyond the remaining balance warns but does not block (managers approve exceptions) |
| feedback | `score` integer 1–5; `given_on` not in the future and not older than 12 months; client feedback requires a project; comment ≤ 2000 chars; at most one client feedback per task per month |
| skill rating | `level` 0–4 integer; self rating writable only by that person; manager rating only by their manager or an admin |
| cert | `expires_on > completed_on`; `completed` requires `completed_on`; a past `expires_on` flips to `expired` on read |
| all numerics | rejected unless finite; clamped to the stated range; never coerced from an empty string to 0 |

## 7. Privacy and retention

Attendance, late-login minutes and behavioural flags are employee monitoring.

- purpose and retention are published in-app: raw attendance and late logins are
  kept 24 months, monthly aggregates 5 years, then the raw rows are deleted.
- a person can view their own complete record and raise a dispute, which creates
  an audited `tp_note` on the entry.
- reads of another person's attendance or feedback are logged.
- exports of more than one person's data require the admin role and are
  watermarked with the requesting user and timestamp.
- the sample names and numbers from the design export are **seed-only** and are
  never inserted outside an explicit seed command.

## 8. Known gaps still open

1. **Hours: partly resolved.** Overtime now has a manual entry in Quick log,
   so the overtime metric is computable. Because entry is manual it is
   incomplete by nature, so the team figure is always reported together with
   how many people have any overtime recorded at all. Utilization still needs
   *billable* hours, which manual overtime does not provide, and stays hidden.
2. **Client score cadence.** Monthly survey, per-task rating, or ad hoc manager
   entry — affects whether the 6-month trend line has enough points.
3. **Who triages UAT defects** and therefore sets `leaked_to_uat`.
4. **Regions and shift times** — UK client site vs Pune office have different
   working days and shift starts. `tp_holiday.region` and
   `tp_config.shift_start` are modelled for it; the actual values are unknown.
5. **Mobile** is on hold, per the design canvas. The shell is responsive so that
   it is not a rewrite later.

## 9. Build order and current state

| Phase | Scope | State |
|---|---|---|
| 0 | Definitions, metric formulas, attention rule, permission matrix | done — this document |
| 1 | Migrations, roles and row scoping, config, API split, app shell, people list | done |
| 2 | Add and edit people, import, manager tree editing | done |
| 3 | Quick log, entry list, audit viewer | done |
| 4 | Tasks and delivery dashboard, metric endpoints and snapshots | done |
| 5 | Attendance calendar, holidays, leave, late logins | done |
| 6 | Skill catalogue, self and manager ratings, heatmap, certificates | done |
| 7 | Attention engine, overview KPIs, notifications, exports | done |
| 8 | Accessibility audit, responsive down to tablet, mobile, performance | next |

### Phase 1 delivered

- `db/migrations/001_teampulse.sql` — every `tp_` table, with the constraints
  from section 6 expressed in the schema where Postgres allows it.
- `scripts/migrate.mjs` — numbered migrations tracked in `_migrations`, so
  schema changes no longer have to be self-healed from inside a route handler.
- `lib/tp/roles.js` — role mapping and the recursive manager-tree query, with a
  depth cap so a `manager_id` cycle cannot hang a request. Row access is decided
  here and nowhere else.
- `lib/tp/validate.js` — the server-side validators, including the numeric
  guards that stop `Number('')` becoming a real zero in the database.
- `lib/tp/dates.js` — working days from the real calendar and the holiday table.
- `lib/tp/audit.js`, `lib/tp/config.js`, `lib/tp/people.js`.
- `api/tp/[...path].js` — health, `me`, config read and write, projects, people
  list and person read. Reading someone else's record writes an audit row.
- Front end: `.tp` token scope, layout shell, loading, empty, error and
  no-access states, status pills that carry a glyph as well as a colour, the
  people list with server-side filtering, sorting, paging and URL-synced
  filters, and honest em dashes wherever a metric has no data yet.
- `tests/tp.test.mjs` — 14 tests over the validators, date maths and
  formatters. `npm test`.

### Running it

```
vercel env pull .env.local
node --env-file=.env.local scripts/migrate.mjs
TP_SEED=1 node --env-file=.env.local scripts/seed-teampulse.mjs   # sample data, never in production
npm run dev            # TeamPulse is at /tp
```

A signed-in account needs `users.status = 'approved'`, and a manager or member
needs a `tp_person` row whose `user_id` points at them. The seed script prints
the statement that links one.

### Phase 2 delivered

- `lib/tp/personWrite.js` — one validator for create, edit and import.
  Experience is entered in years and stored in months. Manager cycles are
  rejected by checking the candidate against the person's own subtree, which
  the table constraint cannot do. A manager may only assign a manager from
  their own tree, so they cannot move someone out of their own visibility.
- `lib/tp/csv.js` — an RFC 4180 reader. A name like `O'Brien, Sean` or a note
  with a comma in it would otherwise shift every later column.
- `lib/tp/personImport.js` — dry run first, and nothing is written unless
  every row validates. Duplicate emails inside the file are caught as well as
  against the table. Managers must already exist, so they are imported first.
- API: `POST /people`, `PUT /people/:id` (with optimistic locking on
  `updated_at`, returning 409 and the current row on a conflict),
  `DELETE /people/:id` (deactivate, refused while they still manage active
  people), `POST /people/import`, `GET /options`.
- Front end: add and edit form with inline validation mirroring the server,
  a deactivate confirmation that says what it does and does not do, and an
  import screen that shows per-row problems with line numbers before anything
  is written.
- Deleting a person is never offered. Deactivation keeps their history, which
  the team metrics and the audit trail both still need.

### Phase 3 delivered

Capture, and the ability to correct it.

- `lib/tp/entries.js` — one handler per entry type, each enforcing the rules
  from section 5 and 6:
  - **Absence** expands a multi-day range to one row per *working* day, so a
    Friday-to-Tuesday leave is three days and not five. A single non-working
    date is refused unless explicitly forced, rather than silently writing
    nothing. A clash with an existing day returns 409 with the current values,
    and overwriting keeps the old value in the audit trail.
  - **Late login** derives `minutes_late` from the login time and the region's
    shift start, plus a configurable grace period, and shows it read-only. The
    design let both the time and the minutes be typed, which allows a 10:20
    login recorded as five minutes late. Logging a late arrival on a recorded
    leave day is refused. Over four hours late requires a note.
  - **Feedback** enforces the 1-5 integer scale, no future dates, nothing older
    than 12 months, a project for client feedback, and one client feedback per
    task per month.
  - **Achievement** and **Overtime**, the latter capped at 16 hours per person
    per day across entries.
- `lib/tp/entryFeed.js` — one reverse-chronological feed across the entry
  tables with server-side paging, plus edit and delete. Only value and note
  fields are editable: moving an entry to another person would rewrite two
  people's history, so that is a delete and a re-entry, and the trail shows
  both.
- `GET /audit` and the audit screen. Quick log promises entries are audited;
  without somewhere to read the trail, that promise is unverifiable. Reads of
  another person's record appear as `read.*` actions.
- `workday.grace_minutes` (default 10) added to config. Without it a 09:31
  arrival against a 09:30 shift becomes a tracked infraction.
- Task updates are **not** an entry type. A task status change belongs with the
  task and its event history, and lands in phase 4.

### Phase 4 delivered

- `lib/tp/tasks.js` — task create, edit, list and status history. The rules the
  schema cannot express live in `applyStatusRules`: `done` forces 100% and
  stamps a completion time, reopening clears it and increments the reopen
  count, blocking requires a reason, and a task at 100% that is not done is
  refused rather than drawn as a full bar next to "in progress".
- `tp_task_event` is the source of truth for reopen counts and aging, so
  neither can be typed over.
- `lib/tp/metrics.js` — every formula from section 3, aggregated in SQL:
  - the on-time denominator includes open tasks already past due, so an
    overdue task that is never finished cannot improve the figure
  - a zero denominator returns `null`, which the UI renders as an em dash with
    the reason, never `0%`
  - task aging is counted in **working** days from each owner's region
    calendar; calendar days would age a Friday deadline by three over a
    weekend nobody worked
  - the attendance denominator is each person's own working days from their
    joining date, not a hardcoded 21
  - overtime ships with a coverage count, because manual entry makes a low
    total ambiguous
  - utilization still returns `null`: nothing records billable hours
- Monthly trends read `tp_metric_snapshot` and compute what is missing. A
  closed month never changes, so it is computed once; the current month is
  never cached.
- Migration 002 replaces the snapshot unique constraint with two partial
  indexes: a plain unique constraint does not dedupe rows whose `person_id` is
  NULL, so every team-scope upsert was inserting instead of updating.
- Charts (`src/components/tp/charts/Primitives.jsx`) follow one set of rules:
  bars are a share of an explicit maximum so nothing overflows its track; a
  metric with no data shows an em dash rather than a zero-length bar; every
  chart has a "show values" table; marks have tooltips on hover and on
  keyboard focus; the target on the on-time chart is a grey reference mark, not
  a series.
- Chart hues are three validated categorical slots (`--tp-cat-1..3`), assigned
  in fixed order and never cycled. The navy ink token is too dark and too
  low-chroma to serve as one, so it stays an ink colour.

### Phase 5 delivered

- `lib/tp/attendance.js` — the month grid is built from the real calendar and
  the holiday table per person's region. The export derived weekends from the
  day number and assumed 30 days, which is wrong for every month that does not
  start on the right weekday and for February in particular.
- **An unrecorded past working day is drawn hollow, not present.** Nobody said
  the person was there, so the gap is visible instead of flattering. A late
  login is marked with an outline as well as a fill.
- The calendar scrolls horizontally with a sticky name column: thirty-one
  legible cells plus a name do not fit a laptop viewport, and squashing them
  was the other option.
- Migration 003 adds `tp_leave_request`. Phase 3 could only record an absence
  after the fact; a person can now ask and a manager decides. **Approval is
  what writes attendance**, one row per working day, and adds to the used-leave
  balance. Nobody can decide their own request. A request over the remaining
  balance warns the approver rather than blocking: exceptions are a manager's
  call.
- Holiday calendar endpoints (admin), so `workingDays` has real data to read.
- Late logins are shown against the previous period, with the direction as a
  word and a glyph rather than only a colour.
- Absence bars are a share of the largest total in the set, so a long absence
  cannot overflow its track — the export's `days * 8 + '%'` broke at 13 days.
- "No leave taken" is reported as a fact with the last date, not as a
  diagnosis: it may mean a heavy project or a holiday nobody logged.
- Spectators are refused attendance outright; every other role is still
  filtered per row, and a manager's read is audited.

### Phase 6 delivered

- `lib/tp/skills.js` — catalogue (admin-maintained, so the heatmap is no longer
  eight hardcoded columns), ratings, heatmap, cover analysis, the finder and
  certifications.
- **Self and manager ratings are separate rows.** The gap between them is the
  useful signal, so neither overwrites the other; the heatmap shows the manager
  rating and marks the cells where the person rates themselves differently. A
  person rates only themselves; a manager rates only their own team and cannot
  rate themselves as their own manager.
- Retiring a skill keeps its ratings. They are history, and a past quarter's
  heatmap still needs them.
- Single points of failure are **counted from the data**, not listed by hand.
  The export named Integrator as a single point of failure on a screen whose own
  heatmap showed two people covering it. The count is of active people rated at
  or above the independent level by a manager, and "nobody rated" is reported
  differently from "one person", because they need different responses.
- The finder reports availability as the allocation figure — "40% free" is a
  staffing conversation; "available" is a promise the data cannot make. It also
  distinguishes "nobody has the skill" from "nobody has been rated for it",
  which is the more likely answer early on.
- Certifications: a past expiry date flips the status to expired on read, so
  nothing sits at "completed" once it has lapsed. Expiry must be after
  completion, a completed certification needs its date, and an enrolled one
  cannot have one.
- The heatmap uses one hue getting darker with level — level is a magnitude,
  not four unrelated categories — and every cell prints its level, so the
  reading never depends on the fill alone.

### Phase 7 delivered

- `lib/tp/attention.js` implements section 4 in a handful of grouped queries
  rather than per person, so it still works past a dozen people. Three
  properties matter more than the arithmetic:
  - **each person is compared with their own previous quarter**, never ranked
    against colleagues, so whoever has the harder project is not punished for it
  - **a signal needs data to fire** — somebody with no client feedback never
    gets a "score dropped" signal
  - **the signals ship with the status.** The overview shows why each person is
    flagged, and a manual override always carries its reason and states what
    the computed status was. A label with no reasons attached is not reviewable,
    and the person is entitled to see what produced it.
- Overview is now real: KPIs from `teamMetrics`, the flagged list with its
  reasons, team shape, working-from split, a six-month on-time trend and the
  expiring-certification warning. Utilization is **absent rather than empty**,
  with a line saying why.
- Leave decisions notify the person through SelfTrack's existing notifications.
  A decision nobody is told about is not one they can act on.
- `lib/tp/exports.js` — CSV export of people, tasks, attendance and feedback.
  Each file opens with a header naming who asked and when, and the export is
  audited: a file leaves the access controls behind, so it has to carry its own
  provenance. Exporting more than one person needs a manager or admin.
- Settings makes every number the design hardcoded editable: the 80% target,
  the attention thresholds, shift start and grace per region, retention, the
  skill catalogue and the holiday calendar. Each change is audited, because
  changing a threshold changes who gets flagged.
