-- ============================================================
-- MONITORING in3pida — Auth Schema
-- Eseguire nel Supabase SQL Editor del progetto monitoring
-- ============================================================

-- ── 1. TABELLA PROFILI ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mon_profiles (
  id         uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email      text UNIQUE NOT NULL,
  full_name  text,
  role       text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mon_profiles ENABLE ROW LEVEL SECURITY;

-- ── 2. FUNZIONE HELPER ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_mon_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.mon_profiles WHERE id = auth.uid()), false);
$$;

-- ── 3. RLS POLICIES ──────────────────────────────────────────
CREATE POLICY "mon_profiles_select_own"
  ON public.mon_profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "mon_profiles_admin_select"
  ON public.mon_profiles FOR SELECT USING (public.is_mon_admin());

CREATE POLICY "mon_profiles_update_own"
  ON public.mon_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "mon_profiles_admin_all"
  ON public.mon_profiles FOR ALL USING (public.is_mon_admin());

-- ── 4. TRIGGER updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_mon_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER mon_profiles_updated_at
  BEFORE UPDATE ON public.mon_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_mon_updated_at();

-- ── 5. TRIGGER: profilo automatico alla registrazione ─────────
--    mario@in3pida.it → admin, tutti gli altri → user
CREATE OR REPLACE FUNCTION public.handle_new_mon_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.mon_profiles (id, email, full_name, role, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    CASE WHEN NEW.email = 'mario@in3pida.it' THEN 'admin' ELSE 'user' END,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    full_name  = COALESCE(EXCLUDED.full_name, mon_profiles.full_name),
    role       = CASE WHEN EXCLUDED.email = 'mario@in3pida.it' THEN 'admin' ELSE mon_profiles.role END,
    avatar_url = COALESCE(EXCLUDED.avatar_url, mon_profiles.avatar_url),
    updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_mon ON auth.users;
CREATE TRIGGER on_auth_user_created_mon
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_mon_user();

-- ── FINE ─────────────────────────────────────────────────────
-- Dopo aver eseguito questo script:
-- 1. Vai su Authentication → URL Configuration in Supabase
-- 2. Site URL: https://monitoring.in3pida.it
-- 3. Redirect URLs: aggiungi https://monitoring.in3pida.it/**
-- 4. Per Google OAuth: abilita Google provider in Authentication → Providers
