-- ────────────────────────────────────────────────────────────
-- Labours Khata — Add location_id column
--
-- Background:
--   The client runs the business from TWO locations (Farmhouse + Shop)
--   with DIFFERENT labours at each. Until now the labours table had
--   no location concept. This migration adds a nullable location_id
--   column with a FK to public.locations, backfills all existing
--   labours to the new project default (Shop, id=2), and adds an
--   index for filtering.
--
-- Default location policy:
--   Per the client's request, the PROJECT-WIDE default location is
--   now Shop (id=2). Existing labours are migrated to Shop. The user
--   can later edit any labour's location via the Edit Labour dialog.
--
-- Safety:
--   • Idempotent (uses IF NOT EXISTS / checks column existence)
--   • Does not lose any existing data
--   • Does not break existing RPC functions (labours table is not
--     referenced by any RPC)
--
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
-- ────────────────────────────────────────────────────────────

-- ─── 1. Add location_id column to labours (nullable, no default yet) ───
-- We add the column as nullable first so the FK can be created without
-- violating NOT NULL on existing rows. After backfilling, we optionally
-- set a default for future inserts.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'labours'
      and column_name  = 'location_id'
  ) then
    alter table public.labours
      add column location_id bigint;
    raise notice 'Added column labours.location_id';
  else
    raise notice 'Column labours.location_id already exists — skipping';
  end if;
end $$;

-- ─── 2. Backfill existing rows → Shop (id=2) ───
-- Existing labours had no location. Set them all to Shop (id=2),
-- which is the new project-wide default. The user can edit each
-- labour afterwards if a labour actually belongs to Farmhouse.
update public.labours
   set location_id = 2
 where location_id is null
    or location_id not in (select id from public.locations);

-- ─── 3. Add FK + default + index ───
alter table public.labours
  drop constraint if exists labours_location_id_fkey;

alter table public.labours
  add constraint labours_location_id_fkey
  foreign key (location_id)
  references public.locations(id)
  on delete set null;

-- Default to Shop (id=2) for any future INSERT that omits location_id.
-- Note: column stays NULLABLE so a labour without a location is still
-- allowed (e.g. if a location is later deleted from locations table).
alter table public.labours
  alter column location_id set default 2;

create index if not exists idx_labours_location on public.labours (location_id);

-- ─── 4. Verification ───
select id, name, location_id
  from public.labours
 order by id;

-- Expected:
--   every existing labour now has location_id = 2 (Shop)


-- ─── DONE ───
-- The application's TypeScript layer + API routes + UI are updated in
-- the same commit to read/write this column. No further SQL is needed.
