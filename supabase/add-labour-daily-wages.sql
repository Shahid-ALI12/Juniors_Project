-- ────────────────────────────────────────────────────────────
-- Labour Daily Wages Module — Database Migration
--
-- Creates ONE NEW table:
--   labour_daily_wages  — per-day wage earning entries for each labour
--
-- PURPOSE:
--   Client workflow:
--     • Daily: har labour ka din ka wage record karte hain (kamaya)
--     • Monthly: month ke baad labour ko total earned amount pay karte hain
--     • Sometimes mid-month: urgent advance payment dete hain
--   To support this, we need to track EARNED amounts separately from PAID amounts:
--     - labour_payments    = paisa diya (salary, advance, expense — OUTFLOW)
--     - labour_daily_wages = paisa kamaya (per-day earning — INFLOW/credit)
--   Balance Due per labour per month = total_earned − total_paid
--   Status: total_paid = 0   → "Not Paid"
--           total_paid > 0   → "Paid" (with amount + remaining)
--
-- SAFETY:
--   • Uses `if not exists` everywhere — safe to re-run.
--   • Does NOT touch any existing table.
--   • Does NOT modify any existing RPC function.
--
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
-- ────────────────────────────────────────────────────────────

-- ─── 1. labour_daily_wages (daily earning entries) ───
create table if not exists labour_daily_wages (
  id           bigint generated always as identity primary key,
  labour_id    bigint not null references labours(id) on delete restrict,
  wage_date    date not null default current_date,
  amount       numeric(14,2) not null check (amount >= 0),
  notes        text,
  entered_by   text,                                    -- populated by API as 'admin:<uuid>' or 'customer:<id>'
  created_at   timestamptz not null default now()
);

-- One wage entry per labour per day (prevents accidental duplicates
-- when user clicks "Save All" twice on the daily entry form).
-- Using a UNIQUE INDEX (instead of a constraint) so it shows up in
-- the index list and is easier to drop if ever needed.
create unique index if not exists uq_labour_daily_wages_labour_date
  on labour_daily_wages (labour_id, wage_date);

create index if not exists idx_labour_daily_wages_labour on labour_daily_wages (labour_id);
create index if not exists idx_labour_daily_wages_date   on labour_daily_wages (wage_date);

comment on table  labour_daily_wages is 'Labours Khata — per-day wage earning entries (income/credit side).';
comment on column labour_daily_wages.amount is 'Amount earned by labour on wage_date (in Rs.).';
comment on column labour_daily_wages.notes  is 'Optional note (e.g. half-day, overtime, absent).';

-- ─── 2. Enable RLS (no policies = service-role only, matches labours + labour_payments) ───
alter table labour_daily_wages enable row level security;

-- ─── DONE ───
-- Verify with:
--   select count(*) from labour_daily_wages;
--   select * from labour_daily_wages order by wage_date desc limit 5;
--
-- Monthly summary query (per labour, per month):
--   select
--     l.id,
--     l.name,
--     coalesce(sum(dw.amount), 0)                              as total_earned,
--     coalesce(sum(lp.amount), 0)                              as total_paid,
--     coalesce(sum(dw.amount), 0) - coalesce(sum(lp.amount), 0) as balance_due
--   from labours l
--   left join labour_daily_wages dw
--     on dw.labour_id = l.id
--    and to_char(dw.wage_date, 'YYYY-MM') = to_char(now(), 'YYYY-MM')
--   left join labour_payments lp
--     on lp.labour_id = l.id
--    and to_char(lp.payment_date, 'YYYY-MM') = to_char(now(), 'YYYY-MM')
--   group by l.id, l.name
--   order by l.name;
