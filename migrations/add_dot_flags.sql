-- Aggiunge le colonne semafori (dot flags) alla tabella mon_sites
ALTER TABLE mon_sites
    ADD COLUMN IF NOT EXISTS feature_dot_db     BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS feature_dot_crm    BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS feature_dot_amelia BOOLEAN DEFAULT true;
