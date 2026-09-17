-- The unique constraint on (scope, person_id, period_start) does not dedupe
-- team rows: Postgres treats NULL person_id values as distinct, so every
-- team-scope upsert inserted a new row instead of updating one. Two partial
-- indexes give the guarantee for both shapes.
-- The constraint has to go first: its backing index cannot be dropped while
-- the constraint still depends on it. The index drop is kept afterwards for
-- the case where a plain unique index exists without a constraint.
alter table tp_metric_snapshot
  drop constraint if exists tp_metric_snapshot_scope_person_id_period_start_key;

drop index if exists tp_metric_snapshot_scope_person_id_period_start_key;

create unique index if not exists tp_metric_snapshot_team_idx
  on tp_metric_snapshot (scope, period_start) where person_id is null;

create unique index if not exists tp_metric_snapshot_person_idx
  on tp_metric_snapshot (scope, person_id, period_start) where person_id is not null;
