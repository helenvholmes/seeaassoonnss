create extension if not exists pgcrypto;

create table seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- The working copy. The editor autosaves here.
  draft jsonb not null,
  -- The frozen snapshot that visitors see. Set on Publish.
  published jsonb,
  -- Increments on every draft save; used to reject saves from a stale editor tab.
  version integer not null default 1,
  published_at timestamptz,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table media (
  id uuid primary key,
  kind text not null check (kind in ('image')),
  content_type text not null,
  original_key text not null,
  width integer,
  height integer,
  widths integer[],
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table passkeys (
  id text primary key,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[],
  device_type text,
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table auth_challenges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('register', 'login')),
  challenge text not null,
  expires_at timestamptz not null
);

-- Setup tokens are single use. A used token is recorded by its hash.
create table used_setup_tokens (
  token_hash text primary key,
  used_at timestamptz not null default now()
);
