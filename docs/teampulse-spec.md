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

1. **No hours source.** Overtime and utilization stay hidden until a timesheet
   feed exists. Decide: manual entry screen, or import from the existing
   timesheet system.
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
| 3 | Quick log for all five entry types, entry list, audit viewer | next |
| 4 | Tasks and delivery dashboard, metric endpoints and snapshots | |
| 5 | Attendance calendar, holidays, leave, late logins | |
| 6 | Skill catalogue, self and manager ratings, heatmap, certificates | |
| 7 | Attention engine, overview KPIs, notifications, exports | |
| 8 | Accessibility audit, responsive down to tablet, mobile, performance | |

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
