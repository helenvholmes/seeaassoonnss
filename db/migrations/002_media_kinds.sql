-- Phase 3: video, audio and sticker media, and the sticker library.
alter table media drop constraint media_kind_check;
alter table media add constraint media_kind_check check (kind in ('image', 'sticker', 'video', 'audio'));
alter table media add column duration double precision;
alter table media add column size_bytes bigint;

create table stickers (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references media (id),
  name text not null default '',
  width integer not null,
  height integer not null,
  widths integer[] not null,
  created_at timestamptz not null default now()
);
