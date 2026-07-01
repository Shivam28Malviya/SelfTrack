-- SelfTrack schema — Vercel Postgres (Neon)
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  score int not null default 0,
  wins int not null default 0,
  emoji text not null default '🎯',
  avatar text not null default '',
  pending_avatar text not null default '',
  bio text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists history (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  date timestamptz not null default now(),
  points int not null,
  category text not null default 'General'
);
create index if not exists history_user_id_idx on history(user_id);

create table if not exists kudos (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  from_id uuid not null references users(id) on delete cascade,
  from_name text not null,
  emoji text not null,
  ts timestamptz not null default now(),
  unique (user_id, from_id)
);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  text text not null,
  icon text not null default '🔔',
  ts timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists notifications_user_id_idx on notifications(user_id);

create table if not exists audit_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null default 'System',
  action text not null,
  user_id uuid,
  user_name text not null default '',
  points int not null default 0,
  category text not null default '',
  undone boolean not null default false
);

create table if not exists seasons (
  id bigserial primary key,
  name text not null,
  ended_at timestamptz not null default now(),
  podium jsonb not null default '[]'
);

create table if not exists weekly_winners (
  id bigserial primary key,
  week text not null,
  topic text not null,
  winner_id uuid,
  winner_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists meta (
  id int primary key default 1 check (id = 1),
  rewards jsonb not null default '{"first":{"text":"","image":""},"second":{"text":"","image":""}}',
  quote jsonb not null default '{"text":"","image":""}',
  categories jsonb not null default '["General"]',
  announcement jsonb not null default '{"text":"","until":0}'
);
insert into meta (id) values (1) on conflict (id) do nothing;
