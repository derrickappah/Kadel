-- =========================================================
-- KaDel Ghana - Complete Supabase / PostgreSQL Database Schema Migration
-- Execute this script in your Supabase Dashboard SQL Editor
-- =========================================================

-- 1. Create event_settings table (handles pricing & website phase mode)
CREATE TABLE IF NOT EXISTS public.event_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL DEFAULT 'settings',
    event_fee_per_person NUMERIC(10,2) NOT NULL DEFAULT 50.00,
    current_phase TEXT NOT NULL DEFAULT 'leads', -- 'leads' (waitlist mode) or 'active' (live booking mode)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure current_phase column exists if table was created previously
ALTER TABLE public.event_settings 
ADD COLUMN IF NOT EXISTS current_phase TEXT NOT NULL DEFAULT 'leads';

-- Insert default settings row if not exists
INSERT INTO public.event_settings (key, event_fee_per_person, current_phase)
VALUES ('settings', 50.00, 'leads')
ON CONFLICT (key) DO UPDATE 
SET current_phase = EXCLUDED.current_phase;


-- 2. Create leads table (for priority reservation interest / waitlist)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    institution TEXT DEFAULT 'General',
    course TEXT NOT NULL,
    estimated_guests INTEGER DEFAULT 10,
    expected_graduation_period TEXT DEFAULT 'Pending Announcement',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'contacted', 'converted', 'archived'
    notes TEXT DEFAULT '',
    last_email_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_code ON public.leads(lead_code);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);


-- 3. Create graduation_dates table
CREATE TABLE IF NOT EXISTS public.graduation_dates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- 4. Create products table (catering menu items: food, drink, pastry)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('food', 'drink', 'pastry')),
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    vendor TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 5. Create bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_code TEXT UNIQUE NOT NULL,
    graduate_name TEXT NOT NULL,
    course TEXT NOT NULL,
    graduation_date TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    attendees_count INTEGER NOT NULL CHECK (attendees_count > 0),
    wants_food BOOLEAN NOT NULL DEFAULT FALSE,
    selections JSONB DEFAULT '[]'::jsonb,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'failed', 'cancelled'
    table_number TEXT,
    booking_secret TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS booking_secret TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_code ON public.bookings(reservation_code);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.bookings(graduation_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);


-- 6. Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    reference TEXT UNIQUE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
    channel TEXT DEFAULT 'moolre',
    gateway TEXT DEFAULT 'moolre',
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_ref ON public.payments(reference);


-- 7. Table Permissions & Row Level Security (RLS)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Enable Row Level Security (RLS) on all public tables
ALTER TABLE public.graduation_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Hardened Least-Privilege RLS Policies (OWASP A07 Remediation)

-- Products: Public can view active products; mutations restricted to service role
DROP POLICY IF EXISTS "Allow all on products" ON public.products;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Service role full access on products" ON public.products;

CREATE POLICY "Public can view active products" ON public.products
    FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Service role full access on products" ON public.products
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Graduation Dates: Public can view active dates; mutations restricted to service role
DROP POLICY IF EXISTS "Allow all on graduation_dates" ON public.graduation_dates;
DROP POLICY IF EXISTS "Public can view active dates" ON public.graduation_dates;
DROP POLICY IF EXISTS "Service role full access on graduation_dates" ON public.graduation_dates;

CREATE POLICY "Public can view active dates" ON public.graduation_dates
    FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Service role full access on graduation_dates" ON public.graduation_dates
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Event Settings: Public can read settings; mutations restricted to service role
DROP POLICY IF EXISTS "Allow all on event_settings" ON public.event_settings;
DROP POLICY IF EXISTS "Public can view event settings" ON public.event_settings;
DROP POLICY IF EXISTS "Service role full access on event_settings" ON public.event_settings;

CREATE POLICY "Public can view event settings" ON public.event_settings
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access on event_settings" ON public.event_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bookings: Public can insert pending bookings; updates and queries managed by backend service role
DROP POLICY IF EXISTS "Allow all on bookings" ON public.bookings;
DROP POLICY IF EXISTS "Public can insert pending bookings" ON public.bookings;
DROP POLICY IF EXISTS "Service role full access on bookings" ON public.bookings;

CREATE POLICY "Public can insert pending bookings" ON public.bookings
    FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
CREATE POLICY "Service role full access on bookings" ON public.bookings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Payments: Highly sensitive table; restricted strictly to backend service role
DROP POLICY IF EXISTS "Allow all on payments" ON public.payments;
DROP POLICY IF EXISTS "Service role full access on payments" ON public.payments;

CREATE POLICY "Service role full access on payments" ON public.payments
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Leads: Public can register interest (insert only); management restricted to backend service role
DROP POLICY IF EXISTS "Allow all on leads" ON public.leads;
DROP POLICY IF EXISTS "Public can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Service role full access on leads" ON public.leads;

CREATE POLICY "Public can insert leads" ON public.leads
    FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
CREATE POLICY "Service role full access on leads" ON public.leads
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. Create profiles table (for administrative role mapping)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access on profiles" ON public.profiles;

CREATE POLICY "Service role full access on profiles" ON public.profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);



