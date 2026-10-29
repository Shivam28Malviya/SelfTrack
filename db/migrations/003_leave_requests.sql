-- Leave requests. Phase 3 let a manager record an absence that had already
-- happened; this is the forward-looking half, so a person can ask and a
-- manager can approve, rather than leave being something only ever logged
-- after the fact by someone else.
create table if not exists tp_leave_request (
  id bigserial primary key,
  person_id bigint not null references tp_person(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  type text not null default 'planned' check (type in ('planned', 'sick')),
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  working_days int not null default 0,
  decided_by uuid references users(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '',
  requested_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tp_leave_range check (to_date >= from_date)
);
create index if not exists tp_leave_request_person_idx on tp_leave_request (person_id, from_date);
create index if not exists tp_leave_request_status_idx on tp_leave_request (status) where status = 'pending';
