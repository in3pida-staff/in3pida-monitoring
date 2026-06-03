-- in3pida Monitoring — Schema Supabase
-- Copia e incolla tutto questo nell'editor SQL di Supabase e clicca Run

CREATE TABLE IF NOT EXISTS mon_sites (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id text UNIQUE NOT NULL,
    api_key text NOT NULL,
    site_url text,
    site_name text,
    plugin_name text NOT NULL DEFAULT 'unknown',
    plugin_version text,
    wp_version text,
    php_version text,
    theme_active text,
    has_supabase boolean DEFAULT false,
    has_crm boolean DEFAULT false,
    has_amelia boolean DEFAULT false,
    feature_stats boolean DEFAULT true,
    feature_crm_tab boolean DEFAULT true,
    feature_settings_tab boolean DEFAULT true,
    first_seen timestamptz DEFAULT now(),
    last_heartbeat timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mon_heartbeats (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id text NOT NULL,
    plugin_version text,
    wp_version text,
    php_version text,
    theme_active text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mon_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id text NOT NULL,
    level text NOT NULL DEFAULT 'info',
    message text NOT NULL,
    context jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mon_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mon_integration_stats (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id text NOT NULL,
    integration text NOT NULL,
    status text NOT NULL,
    error_message text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hb_site    ON mon_heartbeats(site_id);
CREATE INDEX IF NOT EXISTS idx_hb_time    ON mon_heartbeats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_site   ON mon_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_log_time   ON mon_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ev_site    ON mon_events(site_id);
CREATE INDEX IF NOT EXISTS idx_ev_type    ON mon_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ev_time    ON mon_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_is_site    ON mon_integration_stats(site_id);
CREATE INDEX IF NOT EXISTS idx_is_time    ON mon_integration_stats(created_at DESC);

ALTER TABLE mon_sites             DISABLE ROW LEVEL SECURITY;
ALTER TABLE mon_heartbeats        DISABLE ROW LEVEL SECURITY;
ALTER TABLE mon_logs              DISABLE ROW LEVEL SECURITY;
ALTER TABLE mon_events            DISABLE ROW LEVEL SECURITY;
ALTER TABLE mon_integration_stats DISABLE ROW LEVEL SECURITY;
