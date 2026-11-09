-- Phase 6: 3D models and the p5.js sketch library.
alter table media drop constraint media_kind_check;
alter table media add constraint media_kind_check check (kind in ('image', 'sticker', 'video', 'audio', 'model'));
-- Size of the processed public file (models), for the editor's size report.
alter table media add column public_bytes bigint;

-- The owner's p5.js sketches, for reuse as season backgrounds. A season stores its
-- own copy of the code, so editing or removing a sketch here never changes a page.
create table sketches (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
