-- Indexes for the access patterns the later phases added. Each one backs a
-- query that runs on every page load of a dashboard, so they matter well
-- before the table is large.

-- Late logins are always filtered on minutes_late > 0 over a date range; a
-- partial index keeps it to the rows that qualify.
create index if not exists tp_attendance_late_idx
  on tp_attendance (date, person_id) where minutes_late > 0;

-- Attendance metrics group by type over a date range.
create index if not exists tp_attendance_type_date_idx
  on tp_attendance (type, date);

-- The client-score metric only ever reads client feedback by date.
create index if not exists tp_feedback_source_date_idx
  on tp_feedback (source, given_on);

create index if not exists tp_overtime_date_idx
  on tp_overtime (date);

-- Delivery metrics count tasks completed inside a period.
create index if not exists tp_task_status_completed_idx
  on tp_task (status, completed_at) where completed_at is not null;

-- The skill finder and the cover analysis both read manager ratings at or
-- above a level.
create index if not exists tp_skill_rating_lookup_idx
  on tp_skill_rating (skill_id, rated_by, level);

create index if not exists tp_skill_rating_person_idx
  on tp_skill_rating (person_id, rated_by);

-- The expiry sweep reads completed certificates with a date in the past.
create index if not exists tp_cert_status_idx
  on tp_cert (status, expires_on);

create index if not exists tp_task_event_actor_idx
  on tp_task_event (to_status, ts);
