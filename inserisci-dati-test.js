require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function main() {
    console.log('Inserimento dati di test...');

    const now = new Date();
    const ieri = new Date(now - 86400000);
    const settimanaFa = new Date(now - 7 * 86400000);

    // ─── SITI ────────────────────────────────────────────────────────────────
    const siti = [
        {
            site_id:        'site_hotel_hawaii',
            api_key:        'key_hotel_hawaii',
            site_name:      'Hotel Hawaii Martinsicuro',
            site_url:       'https://hotelhawaiiitalia.it',
            plugin_name:    'in3pida-form-2',
            plugin_version: '2.2.6',
            wp_version:     '6.7.2',
            php_version:    '8.2.10',
            theme_active:   'Divi',
            first_seen:     new Date('2025-01-12').toISOString(),
            last_heartbeat: new Date(now - 2 * 3600000).toISOString(),
        },
        {
            site_id:        'site_residence_pineta',
            api_key:        'key_residence_pineta',
            site_name:      'Residence Pineta',
            site_url:       'https://residencepineta.it',
            plugin_name:    'in3pida-form-2',
            plugin_version: '2.2.5',
            wp_version:     '6.6.1',
            php_version:    '8.1.27',
            theme_active:   'Avada',
            first_seen:     new Date('2025-02-03').toISOString(),
            last_heartbeat: new Date(now - 18 * 3600000).toISOString(),
        },
        {
            site_id:        'site_hotel_roma',
            api_key:        'key_hotel_roma',
            site_name:      'Hotel Roma Centro',
            site_url:       'https://hotelromacentro.com',
            plugin_name:    'in3pida-form-2',
            plugin_version: '2.2.3',
            wp_version:     '6.5.0',
            php_version:    '8.0.30',
            theme_active:   'GeneratePress',
            first_seen:     new Date('2025-03-15').toISOString(),
            last_heartbeat: new Date(now - 3 * 3600000).toISOString(),
        },
        {
            site_id:        'site_bb_adriatico',
            api_key:        'key_bb_adriatico',
            site_name:      'B&B Adriatico',
            site_url:       'https://bbadriaticorimini.it',
            plugin_name:    'in3pida-form-2',
            plugin_version: '2.2.6',
            wp_version:     '6.7.2',
            php_version:    '8.2.10',
            theme_active:   'Divi',
            first_seen:     new Date('2025-04-28').toISOString(),
            last_heartbeat: new Date(now - 1 * 3600000).toISOString(),
        },
        {
            site_id:        'site_hotel_rimini',
            api_key:        'key_hotel_rimini',
            site_name:      'Hotel Bellavista Rimini',
            site_url:       'https://hotelbellavistarimini.it',
            plugin_name:    'in3pida-form-2',
            plugin_version: '2.2.6',
            wp_version:     '6.7.2',
            php_version:    '8.2.10',
            theme_active:   'Astra',
            first_seen:     new Date('2025-05-10').toISOString(),
            last_heartbeat: new Date(now - 30 * 60000).toISOString(),
        },
    ];

    for (const sito of siti) {
        await supabase.from('mon_sites').upsert(sito, { onConflict: 'site_id' });
    }
    console.log(`✓ ${siti.length} siti inseriti`);

    // ─── EVENTI (form inviati) ────────────────────────────────────────────────
    const eventi = [];
    for (let i = 0; i < 47; i++) {
        const giorniFA = Math.floor(Math.random() * 7);
        eventi.push({
            site_id:    'site_hotel_hawaii',
            event_type: 'form_submitted',
            payload:    { form_id: 1, submission_id: 100 + i },
            created_at: new Date(now - giorniFA * 86400000 - Math.random() * 3600000).toISOString(),
        });
    }
    for (let i = 0; i < 23; i++) {
        const giorniFA = Math.floor(Math.random() * 7);
        eventi.push({
            site_id:    'site_residence_pineta',
            event_type: 'form_submitted',
            payload:    { form_id: 1, submission_id: 200 + i },
            created_at: new Date(now - giorniFA * 86400000 - Math.random() * 3600000).toISOString(),
        });
    }
    for (let i = 0; i < 12; i++) {
        eventi.push({
            site_id:    'site_bb_adriatico',
            event_type: 'form_submitted',
            payload:    { form_id: 1, submission_id: 300 + i },
            created_at: new Date(now - Math.floor(Math.random() * 7) * 86400000).toISOString(),
        });
    }
    await supabase.from('mon_events').insert(eventi);
    console.log(`✓ ${eventi.length} eventi inseriti`);

    // ─── INTEGRATION STATS (ultime 24h) ──────────────────────────────────────
    const stats = [];

    // Hotel Hawaii — Supabase OK, CRM OK, Amelia 2 errori
    for (let i = 0; i < 45; i++) stats.push({ site_id: 'site_hotel_hawaii', integration: 'supabase', status: 'ok',    error_message: null, created_at: new Date(now - i * 1800000).toISOString() });
    for (let i = 0; i < 45; i++) stats.push({ site_id: 'site_hotel_hawaii', integration: 'crm',      status: 'ok',    error_message: null, created_at: new Date(now - i * 1800000).toISOString() });
    for (let i = 0; i < 43; i++) stats.push({ site_id: 'site_hotel_hawaii', integration: 'amelia',   status: 'ok',    error_message: null, created_at: new Date(now - i * 1800000).toISOString() });
    stats.push({ site_id: 'site_hotel_hawaii', integration: 'amelia', status: 'error', error_message: 'BAD_CONTACT_MSISDN', created_at: new Date(now - 3600000).toISOString() });
    stats.push({ site_id: 'site_hotel_hawaii', integration: 'amelia', status: 'error', error_message: 'BAD_CONTACT_MSISDN', created_at: new Date(now - 7200000).toISOString() });

    // Residence Pineta — Supabase OK, CRM info (già presente), Amelia skipped (consenso non dato)
    for (let i = 0; i < 20; i++) stats.push({ site_id: 'site_residence_pineta', integration: 'supabase', status: 'ok',      error_message: null,                    created_at: new Date(now - i * 3600000).toISOString() });
    for (let i = 0; i < 20; i++) stats.push({ site_id: 'site_residence_pineta', integration: 'crm',      status: 'info',    error_message: 'Contatto già presente', created_at: new Date(now - i * 3600000).toISOString() });
    for (let i = 0; i < 20; i++) stats.push({ site_id: 'site_residence_pineta', integration: 'amelia',   status: 'skipped', error_message: 'Consenso non dato',     created_at: new Date(now - i * 3600000).toISOString() });

    // Hotel Roma — Supabase con errori
    for (let i = 0; i < 8;  i++) stats.push({ site_id: 'site_hotel_roma', integration: 'supabase', status: 'ok',    error_message: null,             created_at: new Date(now - i * 3600000).toISOString() });
    for (let i = 0; i < 4;  i++) stats.push({ site_id: 'site_hotel_roma', integration: 'supabase', status: 'error', error_message: 'PGRST204: email', created_at: new Date(now - i * 3600000).toISOString() });

    // B&B Adriatico — tutto OK
    for (let i = 0; i < 12; i++) stats.push({ site_id: 'site_bb_adriatico', integration: 'supabase', status: 'ok', error_message: null, created_at: new Date(now - i * 1800000).toISOString() });
    for (let i = 0; i < 12; i++) stats.push({ site_id: 'site_bb_adriatico', integration: 'crm',      status: 'ok', error_message: null, created_at: new Date(now - i * 1800000).toISOString() });
    for (let i = 0; i < 12; i++) stats.push({ site_id: 'site_bb_adriatico', integration: 'amelia',   status: 'ok', error_message: null, created_at: new Date(now - i * 1800000).toISOString() });

    await supabase.from('mon_integration_stats').insert(stats);
    console.log(`✓ ${stats.length} statistiche inserite`);

    // ─── LOG ERRORI ───────────────────────────────────────────────────────────
    await supabase.from('mon_logs').insert([
        { site_id: 'site_hotel_hawaii',    level: 'error',   message: 'Amelia: BAD_CONTACT_MSISDN per tel +39347...',  created_at: new Date(now - 3600000).toISOString() },
        { site_id: 'site_hotel_hawaii',    level: 'warning', message: 'Supabase: risposta lenta (2.4s)',               created_at: new Date(now - 5 * 3600000).toISOString() },
        { site_id: 'site_hotel_roma',      level: 'error',   message: 'Supabase PGRST204: colonna email non trovata',  created_at: new Date(now - 2 * 3600000).toISOString() },
        { site_id: 'site_hotel_roma',      level: 'error',   message: 'Supabase PGRST204: colonna email non trovata',  created_at: new Date(now - 5 * 3600000).toISOString() },
        { site_id: 'site_residence_pineta',level: 'info',    message: 'Plugin aggiornato alla v2.2.5',                 created_at: new Date(now - 86400000).toISOString() },
        { site_id: 'site_bb_adriatico',    level: 'info',    message: 'Primo heartbeat registrato',                    created_at: new Date('2025-04-28').toISOString() },
    ]);
    console.log('✓ Log inseriti');

    console.log('\n✓ Dati di test inseriti. Ricarica la dashboard.');
}

main().catch(console.error);
