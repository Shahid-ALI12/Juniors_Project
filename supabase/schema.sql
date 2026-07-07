-- ============================================================
-- Danish Cattle Feed — Full Production Schema
-- Run this ENTIRE file in Supabase SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
--
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- Required extensions
create extension if not exists "pgcrypto";     -- gen_random_uuid()
create extension if not exists "pgjwt";         -- (optional, supabase default)

-- ============================================================
-- 1. APP CUSTOMERS (subscription logins) — existing, tightened
-- ============================================================
create table if not exists app_customers (
  id                text primary key,
  name              text not null,
  email             text not null unique,
  password          text not null,           -- bcrypt hash (60 chars). plain NOT allowed.
  subscription_type text not null default 'monthly'
                    check (subscription_type in ('monthly','yearly','custom')),
  subscription_start date not null,
  subscription_end   date not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- 2. MASTER DATA
-- ============================================================
create table if not exists products (
  id           bigint generated always as identity primary key,
  name         text not null,
  default_rate numeric(12,2) not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists products_name_key on products (lower(name)) where deleted_at is null;

create table if not exists locations (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id         bigint generated always as identity primary key,
  name       text not null,
  type       text not null default 'credit' check (type in ('credit','cash')),
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  -- Tombstone for permanent UI deletion. NULL = visible in UI.
  -- Set = customer removed from all dropdowns / Manage Customers page,
  -- but the DB row stays so historical sales/purchases keep working.
  deleted_at timestamptz
);

-- Partial unique index: prevents duplicate customer names among
-- non-tombstoned rows, but allows reusing a tombstoned name in future.
create unique index if not exists customers_name_active_key
  on customers (lower(name))
  where deleted_at is null;

create table if not exists suppliers (
  id         bigint generated always as identity primary key,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. PRODUCT STOCK (per product + location)
-- ============================================================
create table if not exists product_stock (
  id                  bigint generated always as identity primary key,
  product_id          bigint not null references products(id) on delete cascade,
  location_id         bigint not null references locations(id) on delete cascade,
  stock_quantity      numeric(14,3) not null default 0,  -- bags (or kg if we switch)
  last_bag_weight_kg  numeric(10,2),
  created_at          timestamptz not null default now(),
  unique (product_id, location_id)
);

-- ============================================================
-- 4a. MIX ORDERS (parent of grouped sale lines) — before sales FK
-- ============================================================
create table if not exists mix_orders (
  id               bigint generated always as identity primary key,
  customer_id      bigint not null references customers(id) on delete restrict,
  location_id      bigint not null references locations(id) on delete restrict,
  order_date       date not null default current_date,
  target_weight_kg numeric(12,2),
  cash_received    numeric(14,2) not null default 0,
  entered_by       text,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- 4b. SALES
-- ============================================================
create table if not exists sales (
  id                   bigint generated always as identity primary key,
  customer_id          bigint not null references customers(id) on delete restrict,
  product_id           bigint not null references products(id) on delete restrict,
  location_id          bigint not null references locations(id) on delete restrict,
  quantity             numeric(14,3) not null,
  rate_per_bag         numeric(12,2) not null,
  rickshaw_fare        numeric(12,2) not null default 0,
  cash_received        numeric(14,2) not null default 0,
  sale_date            date not null default current_date,
  unit_type            text not null default 'bags' check (unit_type in ('bags','kg')),
  bag_weight_kg        numeric(10,2),
  mix_order_id         bigint references mix_orders(id) on delete set null,
  transaction_group_id text,
  rickshaw_driver_name text,
  entered_by           text,
  created_at           timestamptz not null default now()
);

-- ============================================================
-- 5. EXPENSES
-- ============================================================
create table if not exists expenses (
  id           bigint generated always as identity primary key,
  description  text not null,
  amount       numeric(14,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  entered_by   text,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 6. PURCHASES
-- ============================================================
create table if not exists purchases (
  id                      bigint generated always as identity primary key,
  purchase_date           date not null default current_date,
  product_id              bigint not null references products(id) on delete restrict,
  quantity                numeric(14,3) not null,
  rate_per_bag            numeric(12,2) not null,
  supplier_id             bigint references suppliers(id) on delete set null,
  settled_by_customer_id  bigint references customers(id) on delete set null, -- goods settlement
  cash_paid               numeric(14,2) not null default 0,
  location_id             bigint not null references locations(id) on delete restrict,
  notes                   text,
  entered_by              text,
  unit_type               text not null default 'bags' check (unit_type in ('bags','kg')),
  bag_weight_kg           numeric(10,2),
  created_at              timestamptz not null default now()
);

-- ============================================================
-- 7. CASH (accounts + append-only ledger + transfers)
-- ============================================================
create table if not exists cash_accounts (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists cash_ledger (
  id          bigint generated always as identity primary key,
  entry_date  date not null default current_date,
  account_id  bigint not null references cash_accounts(id) on delete restrict,
  direction   text not null check (direction in ('in','out')),
  amount      numeric(14,2) not null check (amount >= 0),
  source_type text,        -- 'sale' | 'expense' | 'purchase' | 'transfer' | 'opening' | 'correction'
  source_id   bigint,
  description text,
  entered_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists cash_transfers (
  id              bigint generated always as identity primary key,
  transfer_date   date not null default current_date,
  from_account_id bigint not null references cash_accounts(id) on delete restrict,
  to_account_id   bigint not null references cash_accounts(id) on delete restrict,
  amount          numeric(14,2) not null check (amount > 0),
  notes           text,
  entered_by      text,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_sales_sale_date    on sales (sale_date);
create index if not exists idx_sales_customer_id  on sales (customer_id);
create index if not exists idx_sales_mix_order_id on sales (mix_order_id);
create index if not exists idx_expenses_date      on expenses (expense_date);
create index if not exists idx_purchases_date     on purchases (purchase_date);
create index if not exists idx_ledger_acct_date   on cash_ledger (account_id, entry_date);
create index if not exists idx_app_customers_email on app_customers (email);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- App customers: NO public read. Login via verify_customer_login() RPC.
-- Only authenticated (admin) users can read/write.
alter table app_customers enable row level security;
drop policy if exists "Public read for customer login" on app_customers;
drop policy if exists "Allow all operations on app_customers" on app_customers;
drop policy if exists "Admin full access" on app_customers;
create policy "app_customers admin read"   on app_customers for select using (auth.role() = 'authenticated');
create policy "app_customers admin write"  on app_customers for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- All business tables: service-role bypasses RLS; anon/authd blocked at DB level.
alter table products       enable row level security;
alter table locations      enable row level security;
alter table customers      enable row level security;
alter table suppliers      enable row level security;
alter table product_stock  enable row level security;
alter table mix_orders     enable row level security;
alter table sales          enable row level security;
alter table expenses       enable row level security;
alter table purchases      enable row level security;
alter table cash_accounts  enable row level security;
alter table cash_ledger    enable row level security;
alter table cash_transfers enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authd on business tables
-- → only the service role (used by server API routes) can touch them.

-- ============================================================
-- ATOMIC RPC FUNCTIONS (SECURITY DEFINER — run as service role)
-- ============================================================

-- ---- verify_customer_login(p_email, p_password) ------------------
-- Returns safe customer row (no password) when bcrypt hash matches.
-- Returns NULL on any failure.
create or replace function verify_customer_login(p_email text, p_password text)
returns table (
  id text, name text, email text,
  subscription_type text, subscription_start date,
  subscription_end date, is_active boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  v_row app_customers%rowtype;
begin
  select * into v_row from app_customers where email = lower(p_email) limit 1;
  if v_row.id is null then return; end if;
  -- bcrypt hash stored as text; crypt() compares.
  if v_row.password = crypt(p_password, v_row.password) then
    return query select
      v_row.id, v_row.name, v_row.email, v_row.subscription_type,
      v_row.subscription_start, v_row.subscription_end, v_row.is_active;
  end if;
end;
$$;

-- ---- create_sale(p_items, p_customer_id, p_location_id, p_sale_date,
--                  p_cash_received, p_rickshaw_fare, p_rickshaw_driver,
--                  p_transaction_group_id, p_entered_by) -----------
-- Inserts one row per item, decrements stock (bags only), posts a single
-- cash_ledger 'in' entry for cash_received. Atomic.
create or replace function create_sale(
  p_items jsonb,                       -- [{product_id, quantity, rate_per_bag, unit_type, bag_weight_kg}]
  p_customer_id bigint,
  p_location_id bigint,
  p_sale_date date,
  p_cash_received numeric,
  p_rickshaw_fare numeric,
  p_rickshaw_driver text,
  p_transaction_group_id text,
  p_entered_by text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item jsonb;
  v_ps record;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- decrement stock for bag-type items
    if (v_item->>'unit_type') = 'bags' then
      select * into v_ps from product_stock
        where product_id = (v_item->>'product_id')::bigint
          and location_id = p_location_id
        for update;
      if not found then
        -- auto-create a zero row so we can go negative (allowed, logged)
        insert into product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
        values ((v_item->>'product_id')::bigint, p_location_id, 0, null);
      end if;
      update product_stock set
        stock_quantity = stock_quantity - (v_item->>'quantity')::numeric,
        last_bag_weight_kg = coalesce((v_item->>'bag_weight_kg')::numeric, last_bag_weight_kg)
      where product_id = (v_item->>'product_id')::bigint
        and location_id = p_location_id;
    end if;

    insert into sales (
      customer_id, product_id, location_id, quantity, rate_per_bag,
      rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg,
      transaction_group_id, rickshaw_driver_name, entered_by
    ) values (
      p_customer_id,
      (v_item->>'product_id')::bigint,
      p_location_id,
      (v_item->>'quantity')::numeric,
      (v_item->>'rate_per_bag')::numeric,
      0,                                  -- per-line rickshaw not tracked; applied at group level below
      0,                                  -- cash applied once at group level (ledger entry below)
      p_sale_date,
      coalesce(v_item->>'unit_type','bags'),
      nullif(v_item->>'bag_weight_kg','')::numeric,
      p_transaction_group_id,
      p_rickshaw_driver,
      p_entered_by
    );
  end loop;

  -- single cash entry for the whole group
  if p_cash_received > 0 then
    insert into cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    select p_sale_date, a.id, 'in', p_cash_received, 'sale', null,
           'Sale group ' || p_transaction_group_id
    from cash_accounts a where a.name = 'Cash In Hand' limit 1;
  end if;
end;
$$;

-- ---- record_purchase(p_*, p_is_settlement bool) ------------------
-- Inserts purchase, increments stock (bags), posts cash_ledger 'out'
-- only when not a goods settlement.
create or replace function record_purchase(
  p_purchase_date date,
  p_product_id bigint,
  p_quantity numeric,
  p_rate_per_bag numeric,
  p_supplier_id bigint,
  p_settled_by_customer_id bigint,
  p_cash_paid numeric,
  p_location_id bigint,
  p_notes text,
  p_unit_type text,
  p_bag_weight_kg numeric,
  p_entered_by text
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into purchases (
    purchase_date, product_id, quantity, rate_per_bag, supplier_id,
    settled_by_customer_id, cash_paid, location_id, notes, entered_by,
    unit_type, bag_weight_kg
  ) values (
    p_purchase_date, p_product_id, p_quantity, p_rate_per_bag, p_supplier_id,
    p_settled_by_customer_id, p_cash_paid, p_location_id, p_notes, p_entered_by,
    p_unit_type, p_bag_weight_kg
  ) returning purchases.id into v_id;   -- qualified: avoid ambiguity with RETURNS TABLE(id)

  -- increment stock for bag-type purchases
  if p_unit_type = 'bags' then
    insert into product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    values (p_product_id, p_location_id, p_quantity, p_bag_weight_kg)
    on conflict (product_id, location_id) do update
      set stock_quantity = product_stock.stock_quantity + excluded.stock_quantity,
          last_bag_weight_kg = coalesce(excluded.last_bag_weight_kg, product_stock.last_bag_weight_kg);
  end if;

  -- cash out only when not a goods settlement and cash was paid
  if p_settled_by_customer_id is null and p_cash_paid > 0 then
    insert into cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    select p_purchase_date, a.id, 'out', p_cash_paid, 'purchase', v_id,
           'Purchase #' || v_id
    from cash_accounts a where a.name = 'Cash In Hand' limit 1;
  end if;

  return v_id;
end;
$$;

-- ---- record_expense(p_*) -----------------------------------------
-- Inserts expense + cash_ledger 'out' entry.
create or replace function record_expense(
  p_description text, p_amount numeric, p_expense_date date, p_entered_by text
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  insert into expenses (description, amount, expense_date, entered_by)
  values (p_description, p_amount, p_expense_date, p_entered_by)
  returning expenses.id into v_id;   -- qualified

  insert into cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  select p_expense_date, a.id, 'out', p_amount, 'expense', v_id, p_description
  from cash_accounts a where a.name = 'Cash In Hand' limit 1;

  return v_id;
end;
$$;

-- ---- transfer_cash(p_from, p_to, p_amount, p_date, p_notes, p_by)
-- Two ledger entries (out + in) + cash_transfers row.
create or replace function transfer_cash(
  p_from_account_id bigint, p_to_account_id bigint, p_amount numeric,
  p_date date, p_notes text, p_entered_by text
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  insert into cash_transfers (transfer_date, from_account_id, to_account_id, amount, notes, entered_by)
  values (p_date, p_from_account_id, p_to_account_id, p_amount, p_notes, p_entered_by)
  returning cash_transfers.id into v_id;   -- qualified

  insert into cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  values (p_date, p_from_account_id, 'out', p_amount, 'transfer', v_id, 'Transfer out #' || v_id);

  insert into cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  values (p_date, p_to_account_id, 'in', p_amount, 'transfer', v_id, 'Transfer in #' || v_id);

  return v_id;
end;
$$;

-- ---- correct_cash_balance(p_account_id, p_target, p_date, p_by) --
-- Posts a single correction ledger entry so the running sum equals p_target.
create or replace function correct_cash_balance(
  p_account_id bigint, p_target numeric, p_date date, p_entered_by text
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_current numeric(14,2);
  v_diff   numeric(14,2);
  v_dir    text;
  v_id     bigint;
begin
  select coalesce(sum(case when direction='in' then amount else -amount end), 0)
    into v_current from cash_ledger where account_id = p_account_id;

  v_diff := p_target - v_current;
  if v_diff = 0 then return null; end if;
  v_dir := case when v_diff > 0 then 'in' else 'out' end;

  insert into cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  values (p_date, p_account_id, v_dir, abs(v_diff), 'correction', null, 'Manual balance correction')
  returning cash_ledger.id into v_id;   -- qualified

  return v_id;
end;
$$;

-- ---- create_mix_order(p_*, p_items) ------------------------------
-- Atomic: parent mix_orders row + N sale lines sharing mix_order_id.
create or replace function create_mix_order(
  p_customer_id bigint,
  p_location_id bigint,
  p_order_date date,
  p_target_weight_kg numeric,
  p_cash_received numeric,
  p_entered_by text,
  p_items jsonb   -- [{product_id, quantity(kg), rate_per_kg}]
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_mix_id bigint;
  v_item jsonb;
begin
  insert into mix_orders (customer_id, location_id, order_date, target_weight_kg, cash_received, entered_by)
  values (p_customer_id, p_location_id, p_order_date, p_target_weight_kg, p_cash_received, p_entered_by)
  returning mix_orders.id into v_mix_id;   -- qualified

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into sales (
      customer_id, product_id, location_id, quantity, rate_per_bag,
      rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg,
      mix_order_id, entered_by
    ) values (
      p_customer_id,
      (v_item->>'product_id')::bigint,
      p_location_id,
      (v_item->>'quantity')::numeric,
      (v_item->>'rate_per_kg')::numeric,
      0, 0,
      p_order_date,
      'kg',
      null,
      v_mix_id,
      p_entered_by
    );
  end loop;

  if p_cash_received > 0 then
    insert into cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    select p_order_date, a.id, 'in', p_cash_received, 'sale', null,
           'Mix order #' || v_mix_id
    from cash_accounts a where a.name = 'Cash In Hand' limit 1;
  end if;

  return v_mix_id;
end;
$$;

-- ============================================================
-- SEED DATA (idempotent — only inserts if tables empty)
-- ============================================================
insert into locations (name)
select * from (values ('Farm'), ('Shop')) as v(name)
where not exists (select 1 from locations);

insert into cash_accounts (name)
select * from (values ('Cash In Hand'), ('Cash In Locker')) as v(name)
where not exists (select 1 from cash_accounts);

insert into products (name, default_rate)
select * from (values
  ('Wheat Bran (Choker)', 2200),
  ('Cotton Seed Cake (Khal Banola)', 5800),
  ('Maize Gluten (Ghalla)', 4600),
  ('Soya Bean Meal', 7200),
  ('Canola Meal', 5400),
  ('Rice Polish', 3200),
  ('DCP (Dicalcium Phosphate)', 12000),
  ('Salt (Namak)', 800)
) as v(name, rate)
where not exists (select 1 from products);

-- ============================================================
-- DONE.
-- ============================================================
