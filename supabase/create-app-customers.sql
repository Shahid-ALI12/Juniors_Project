-- ============================================================
-- Danish Cattle Feed — Customer Auth Table
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS app_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  subscription_type TEXT NOT NULL DEFAULT 'monthly' CHECK (subscription_type IN ('monthly', 'yearly', 'custom')),
  subscription_start DATE NOT NULL,
  subscription_end DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE app_customers ENABLE ROW LEVEL SECURITY;

-- Public can SELECT (needed for customer login verification)
CREATE POLICY "Public read for customer login" ON app_customers
  FOR SELECT USING (true);

-- Only authenticated users (admin) can INSERT, UPDATE, DELETE
CREATE POLICY "Admin full access" ON app_customers
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Index for faster email lookup during login
CREATE INDEX IF NOT EXISTS idx_app_customers_email ON app_customers (email);