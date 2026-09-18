-- TeamPulse module: people, delivery, attendance, skills, config, audit.
-- All tables prefixed tp_ and independent of the legacy leaderboard tables.

-- ---------- reference ----------

create table if not exists tp_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists tp_holiday (
  date date not null,
  region text not null default 'IN',
  name text not null,
  primary key (date, region)
);

create table if not exists tp_project (
  id bigserial primary key,
  name text not null,
  client text not null default '',
  region text not null default 'IN',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists tp_project_name_idx on tp_project (lower(name));

-- ---------- people ----------

create table if not exists tp_person (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  name text not null,
  initials text not null default '',
  email text,
  designation text not null default 'Analyst'
    check (designation in ('Manager', 'Senior Consultant', 'Consultant', 'Analyst')),
  manager_id bigint references tp_person(id) on delete set null,
  project_id bigint references tp_project(id) on delete set null,
  region text not null default 'IN',
  work_location text not null default 'Office'
    check (work_location in ('Client site', 'Office', 'Home')),
  allocation_pct int not null default 100 check (allocation_pct between 0 and 100),
  date_joined_org date,
  date_joined_team date,
  total_exp_months int not null default 0 check (total_exp_months >= 0),
  relevant_exp_months int not null default 0 check (relevant_exp_months >= 0),
  status_override text check (status_override in ('On track', 'Watch', 'At risk')),
  status_override_reason text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tp_person_exp_order check (relevant_exp_months <= total_exp_months),
  constraint tp_person_not_own_manager check (manager_id is null or manager_id <> id)
);
create index if not exists tp_person_manager_idx on tp_person (manager_id);
create index if not exists tp_person_user_idx on tp_person (user_id);
create unique index if not exists tp_person_email_idx on tp_person (lower(email)) where email is not null;

-- ---------- delivery ----------

create table if not exists tp_task (
  id bigserial primary key,
  title text not null,
  project_id bigint references tp_project(id) on delete set null,
  owner_id bigint references tp_person(id) on delete set null,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  est_hours numeric(6,2) check (est_hours is null or (est_hours > 0 and est_hours <= 500)),
  actual_hours numeric(6,2) check (actual_hours is null or actual_hours >= 0),
  reopened_count int not null default 0 check (reopened_count >= 0),
  leaked_to_uat boolean not null default false,
  blocked_reason text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- due_date >= creation date is enforced in the API: timestamptz::date is not
  -- immutable, so Postgres rejects it inside a check constraint.
  constraint tp_task_done_complete check (status <> 'done' or completed_at is not null)
);
create index if not exists tp_task_owner_idx on tp_task (owner_id);
create index if not exists tp_task_due_idx on tp_task (due_date) where status not in ('done', 'cancelled');
create index if not exists tp_task_completed_idx on tp_task (completed_at);

-- Status history is the source of truth for reopen counts and aging.
create table if not exists tp_task_event (
  id bigserial primary key,
  task_id bigint not null references tp_task(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  ts timestamptz not null default now(),
  from_status text not null default '',
  to_status text not null default '',
  note text not null default ''
);
create index if not exists tp_task_event_task_idx on tp_task_event (task_id, ts);

-- ---------- feedback and achievements ----------

create table if not exists tp_feedback (
  id bigserial primary key,
  person_id bigint not null references tp_person(id) on delete cascade,
  source text not null check (source in ('client', 'peer', 'leadership')),
  score int not null check (score between 1 and 5),
  comment text not null default '',
  task_id bigint references tp_task(id) on delete set null,
  project_id bigint references tp_project(id) on delete set null,
  given_on date not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tp_feedback_person_idx on tp_feedback (person_id, given_on);

create table if not exists tp_achievement (
  id bigserial primary key,
  person_id bigint not null references tp_person(id) on delete cascade,
  title text not null,
  source text not null default 'peer' check (source in ('client', 'peer', 'leadership')),
  happened_on date not null,
  note text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tp_achievement_person_idx on tp_achievement (person_id, happened_on);

-- ---------- attendance ----------

create table if not exists tp_attendance (
  id bigserial primary key,
  person_id bigint not null references tp_person(id) on delete cascade,
  date date not null,
  type text not null default 'present'
    check (type in ('present', 'wfh', 'planned', 'unplanned', 'sick', 'holiday')),
  login_time time,
  minutes_late int not null default 0 check (minutes_late between 0 and 480),
  note text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, date)
);
create index if not exists tp_attendance_date_idx on tp_attendance (date);

create table if not exists tp_leave_balance (
  person_id bigint not null references tp_person(id) on delete cascade,
  year int not null,
  entitled_days numeric(5,1) not null default 0,
  used_days numeric(5,1) not null default 0,
  primary key (person_id, year)
);

-- Populated once a timesheet source exists; see docs/teampulse-spec.md gap 1.
create table if not exists tp_overtime (
  id bigserial primary key,
  person_id bigint not null references tp_person(id) on delete cascade,
  date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  note text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tp_overtime_person_idx on tp_overtime (person_id, date);

-- ---------- skills ----------

create table if not exists tp_skill (
  id bigserial primary key,
  name text not null,
  category text not null default 'General',
  active boolean not null default true,
  sort int not null default 0
);
create unique index if not exists tp_skill_name_idx on tp_skill (lower(name));

create table if not exists tp_skill_rating (
  id bigserial primary key,
  person_id bigint not null references tp_person(id) on delete cascade,
  skill_id bigint not null references tp_skill(id) on delete cascade,
  level int not null check (level between 0 and 4),
  rated_by text not null check (rated_by in ('self', 'manager')),
  rater_id uuid references users(id) on delete set null,
  rated_on date not null default current_date,
  unique (person_id, skill_id, rated_by)
);

create table if not exists tp_cert (
  id bigserial primary key,
  person_id bigint not null references tp_person(id) on delete cascade,
  name text not null,
  issuer text not null default '',
  kind text not null default 'core' check (kind in ('core', 'adjacent')),
  status text not null default 'enrolled'
    check (status in ('enrolled', 'completed', 'expired')),
  completed_on date,
  expires_on date,
  created_at timestamptz not null default now(),
  constraint tp_cert_expiry_after_completion
    check (expires_on is null or completed_on is null or expires_on > completed_on),
  constraint tp_cert_completed_has_date
    check (status <> 'completed' or completed_on is not null)
);
create index if not exists tp_cert_person_idx on tp_cert (person_id);
create index if not exists tp_cert_expiry_idx on tp_cert (expires_on) where expires_on is not null;

-- ---------- notes and audit ----------

create table if not exists tp_note (
  id bigserial primary key,
  person_id bigint not null references tp_person(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  body text not null,
  visibility text not null default 'private' check (visibility in ('private', 'managers')),
  entity text not null default '',
  entity_id bigint,
  ts timestamptz not null default now()
);
create index if not exists tp_note_person_idx on tp_note (person_id, ts);

create table if not exists tp_audit (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor_id uuid references users(id) on delete set null,
  actor_name text not null default '',
  action text not null,
  entity text not null default '',
  entity_id bigint,
  person_id bigint,
  before jsonb,
  after jsonb
);
create index if not exists tp_audit_ts_idx on tp_audit (ts desc);
create index if not exists tp_audit_entity_idx on tp_audit (entity, entity_id);

-- Monthly rollups so six-month trend lines do not rescan the fact tables.
create table if not exists tp_metric_snapshot (
  id bigserial primary key,
  scope text not null check (scope in ('team', 'person')),
  person_id bigint references tp_person(id) on delete cascade,
  period_start date not null,
  metrics jsonb not null default '{}',
  computed_at timestamptz not null default now(),
  unique (scope, person_id, period_start)
);

-- ---------- seed config ----------

insert into tp_config (key, value) values
  ('targets', '{"on_time_pct":80,"client_score":4.0,"reopen_rate_pct":8,"effort_over_est_pct":10,"defects_leaked":0,"cert_target":10}'),
  ('attention', '{"ontime_drop_pp":10,"score_drop":0.5,"unplanned_days_90d":3,"overtime_hours_month":20,"overtime_months":2,"overdue_aged_tasks":2,"overdue_age_days":5,"at_risk_signals":3,"watch_signals":2}'),
  ('workday', '{"shift_start":{"IN":"09:30","UK":"09:00"},"hours_per_day":8,"week_off":[0,6]}'),
  ('retention', '{"raw_months":24,"aggregate_years":5}'),
  ('skill_levels', '["Not rated","Aware","Guided","Independent","Lead"]')
on conflict (key) do nothing;
