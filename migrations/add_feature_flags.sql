-- Aggiunge le colonne feature flags alla tabella mon_sites
-- Da eseguire una volta sola nel Supabase SQL Editor

ALTER TABLE mon_sites
    ADD COLUMN IF NOT EXISTS feature_stats        BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS feature_crm_tab      BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS feature_settings_tab BOOLEAN DEFAULT true;
