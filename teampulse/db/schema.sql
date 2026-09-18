-- Team Pulse base schema: accounts, sessions and notifications.
--
-- The tp_ tables that hold the product's own data are in db/migrations, applied
-- after this. Everything here is `if not exists`, so pointing Team Pulse at a
-- database that already has these tables reuses them rather than failing.
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin', 'spectator')),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now()
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
create index if not exists notifications_user_id_idx on notifications (user_id, ts desc);
