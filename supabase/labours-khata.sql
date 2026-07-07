-- ────────────────────────────────────────────────────────────
-- Labours Khata Module — Database Migration
--
-- Creates two NEW tables:
--   1. labours           — master list of labourers
--   2. labour_payments   — per-day payment entries (salary / advance / expense)
--
-- SAFETY:
--   • Uses `if not exists` everywhere — safe to re-run.
--   • Does NOT touch any existing table.
--   • Does NOT modify any existing RPC function.
--   • Does NOT integrate with cash_ledger (labour payments stay
--     self-contained in this module to avoid disturbing cash accounting).
--
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
-- ────────────────────────────────────────────────────────────

-- ─── 1. labours (master) ───
create table if not exists labours (
  id           bigint generated always as identity primary key,
  name         text not null,
  phone        text,
  role         text,                                     -- e.g. "Mazdoor", "Driver", "Loader"
  daily_wage   numeric(14,2) not null default 0 check (daily_wage >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists idx_labours_active on labours (is_active);
create index if not exists idx_labours_name on labours (name);

comment on table  labours is 'Labours Khata — master list of registered labourers.';
comment on column labours.role       is 'Free-text role/skill (e.g. Mazdoor, Driver, Loader).';
comment on column labours.daily_wage is 'Default expected daily wage (informational; actual payments tracked in labour_payments).';

-- ─── 2. labour_payments (transactions) ───
create table if not exists labour_payments (
  id            bigint generated always as identity primary key,
  labour_id     bigint not null references labours(id) on delete restrict,
  payment_date  date not null default current_date,
  amount        numeric(14,2) not null check (amount >= 0),
  payment_type  text not null default 'salary'
                check (payment_type in ('salary','advance','expense')),
  description   text,
  entered_by    text,                                    -- populated by API as 'admin:<uuid>' or 'customer:<id>'
  created_at    timestamptz not null default now()
);

create index if not exists idx_labour_payments_labour on labour_payments (labour_id);
create index if not exists idx_labour_payments_date   on labour_payments (payment_date);
create index if not exists idx_labour_payments_type   on labour_payments (payment_type);

comment on table  labour_payments is 'Labours Khata — per-day payment entries (salary / advance / expense).';
comment on column labour_payments.payment_type is 'salary | advance | expense — categorises the payment.';

-- ─── 3. Enable RLS (no policies = service-role only, matches existing tables) ───
alter table labours           enable row level security;
alter table labour_payments   enable row level security;

-- ─── DONE ───
-- Verify with:
--   select count(*) from labours;
--   select count(*) from labour_payments;
