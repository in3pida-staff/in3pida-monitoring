require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs    = require('fs');
const multer = require('multer');

const app  = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'in3pida-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ─── PROFILO ─────────────────────────────────────────────────────────────────
const PROFILE_FILE = path.join(__dirname, 'profile.json');
const AVATAR_DIR   = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

function readProfile() {
    if (fs.existsSync(PROFILE_FILE)) return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
    return { name: 'Mario', email: 'mario@in3pida.it', avatar: null };
}

const avatarStorage = multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => cb(null, 'avatar' + path.extname(file.originalname))
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 5 * 1024 * 1024 } });

function requireAuth(req, res, next) {
    if (req.session.authenticated) return next();
    res.status(401).json({ error: 'Non autorizzato' });
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

app.post('/auth/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        req.session.authenticated = true;
        res.json({ ok: true });
    } else {
        res.status(401).json({ error: 'Password errata' });
    }
});

app.post('/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

app.get('/auth/me', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});

app.get('/api/profile', requireAuth, (req, res) => {
    res.json(readProfile());
});

app.post('/api/profile', requireAuth, (req, res) => {
    const { name, email } = req.body;
    const p = readProfile();
    if (name)  p.name  = name.trim();
    if (email) p.email = email.trim();
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(p, null, 2));
    res.json({ ok: true, profile: p });
});

app.post('/api/profile/avatar', requireAuth, uploadAvatar.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nessun file' });
    const p = readProfile();
    p.avatar = '/images/' + req.file.filename + '?t=' + Date.now();
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(p, null, 2));
    res.json({ ok: true, avatar: p.avatar });
});

// ─── PLUGIN API (chiamate da WordPress) ──────────────────────────────────────

app.post('/api/heartbeat', async (req, res) => {
    const { site_id, api_key, plugin_name, plugin_version, wp_version, php_version, theme_active, site_url, site_name } = req.body;
    if (!site_id || !api_key) return res.status(400).json({ error: 'Dati mancanti' });

    try {
        await supabase.from('mon_sites').upsert({
            site_id, api_key,
            site_url, site_name: site_name || site_url,
            plugin_name: plugin_name || 'unknown',
            plugin_version, wp_version, php_version, theme_active,
            last_heartbeat: new Date().toISOString()
        }, { onConflict: 'site_id' });

        await supabase.from('mon_heartbeats').insert({
            site_id, plugin_version, wp_version, php_version, theme_active
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Errore interno' });
    }
});

app.post('/api/log', async (req, res) => {
    const { site_id, api_key, level, message, context } = req.body;
    if (!site_id || !api_key) return res.status(400).json({ error: 'Dati mancanti' });

    try {
        const { data: site } = await supabase.from('mon_sites').select('site_id')
            .eq('site_id', site_id).eq('api_key', api_key).single();
        if (!site) return res.status(401).json({ error: 'Non autorizzato' });

        await supabase.from('mon_logs').insert({
            site_id, level: level || 'info', message: message || '', context: context || {}
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Errore interno' });
    }
});

app.post('/api/event', async (req, res) => {
    const { site_id, api_key, event_type, payload } = req.body;
    if (!site_id || !api_key) return res.status(400).json({ error: 'Dati mancanti' });

    try {
        const { data: site } = await supabase.from('mon_sites').select('site_id')
            .eq('site_id', site_id).eq('api_key', api_key).single();
        if (!site) return res.status(401).json({ error: 'Non autorizzato' });

        await supabase.from('mon_events').insert({
            site_id, event_type, payload: payload || {}
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Errore interno' });
    }
});

app.post('/api/integration-stat', async (req, res) => {
    const { site_id, api_key, integration, status, error_message } = req.body;
    if (!site_id || !api_key) return res.status(400).json({ error: 'Dati mancanti' });

    try {
        await supabase.from('mon_integration_stats').insert({
            site_id, integration, status, error_message: error_message || null
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Errore interno' });
    }
});

// ─── DASHBOARD API (protette) ─────────────────────────────────────────────────

app.get('/api/plugins', requireAuth, async (req, res) => {
    try {
        const yesterday = new Date(Date.now() - 86400000);
        const [{ data: sites, error }, { data: errStats }] = await Promise.all([
            supabase.from('mon_sites').select('plugin_name, site_id, last_heartbeat, plugin_version'),
            supabase.from('mon_integration_stats').select('site_id').eq('status', 'error').gte('created_at', yesterday.toISOString())
        ]);
        if (error) throw error;

        const sitesWithErrors = new Set((errStats || []).map(e => e.site_id));

        const now = new Date();
        const plugins = {};

        (sites || []).forEach(s => {
            const name = s.plugin_name;
            if (!plugins[name]) plugins[name] = { name, total: 0, active: 0, inactive: 0, errors: 0, versions: {} };

            const hrs = s.last_heartbeat ? (now - new Date(s.last_heartbeat)) / 3600000 : 9999;
            plugins[name].total++;
            if (hrs < 25) plugins[name].active++;
            else          plugins[name].inactive++;
            if (sitesWithErrors.has(s.site_id)) plugins[name].errors++;

            if (s.plugin_version) {
                plugins[name].versions[s.plugin_version] = (plugins[name].versions[s.plugin_version] || 0) + 1;
            }
        });

        Object.values(plugins).forEach(p => {
            if      (p.inactive > 0 && p.active === 0) p.status = 'red';
            else if (p.inactive > 0 || p.errors > 0)   p.status = 'yellow';
            else                                        p.status = 'green';
        });

        // Richieste giornaliere globali (ultimi 30 giorni)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        const { data: eventsAll } = await supabase
            .from('mon_events')
            .select('site_id, created_at')
            .eq('event_type', 'form_submitted')
            .gte('created_at', thirtyDaysAgo.toISOString());

        const now2 = new Date();
        const dailyGlobal = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now2 - i * 86400000);
            dailyGlobal[d.toISOString().slice(0, 10)] = {};
        }

        // Mappa site_id → plugin_name
        const sitePlugin = {};
        (sites || []).forEach(s => { sitePlugin[s.site_id] = s.plugin_name; });

        (eventsAll || []).forEach(e => {
            const day = e.created_at.slice(0, 10);
            const pname = sitePlugin[e.site_id] || 'unknown';
            if (dailyGlobal[day] !== undefined) {
                dailyGlobal[day][pname] = (dailyGlobal[day][pname] || 0) + 1;
            }
        });

        const pluginNames = [...new Set((sites || []).map(s => s.plugin_name))];
        const dailySeries = pluginNames.map(pname => ({
            plugin: pname,
            data: Object.entries(dailyGlobal).map(([date, counts]) => ({ date, count: counts[pname] || 0 }))
        }));

        res.json({ plugins: Object.values(plugins), daily_series: dailySeries });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/plugins/:name/sites', requireAuth, async (req, res) => {
    try {
        const { data: sites, error } = await supabase
            .from('mon_sites')
            .select('*')
            .eq('plugin_name', decodeURIComponent(req.params.name))
            .order('last_heartbeat', { ascending: false });
        if (error) throw error;

        const siteIds = (sites || []).map(s => s.site_id);
        const yesterday = new Date(Date.now() - 86400000);

        const [{ data: lastEvents }, { data: recentStats }] = await Promise.all([
            supabase.from('mon_events').select('site_id, created_at')
                .in('site_id', siteIds).eq('event_type', 'form_submitted')
                .order('created_at', { ascending: false }),
            supabase.from('mon_integration_stats').select('site_id, integration, status, created_at')
                .in('site_id', siteIds).gte('created_at', yesterday.toISOString())
                .order('created_at', { ascending: false })
        ]);

        // Ultima richiesta per sito
        const lastReqMap = {};
        (lastEvents || []).forEach(e => {
            if (!lastReqMap[e.site_id]) lastReqMap[e.site_id] = e.created_at;
        });

        // Ultimo stato integrazione per sito (più recente nelle 24h)
        const integMap = {};
        (recentStats || []).forEach(s => {
            if (!integMap[s.site_id]) integMap[s.site_id] = {};
            if (!integMap[s.site_id][s.integration]) integMap[s.site_id][s.integration] = s.status;
        });

        const now = new Date();
        res.json((sites || []).map(s => {
            const hrs = s.last_heartbeat ? (now - new Date(s.last_heartbeat)) / 3600000 : 9999;
            const status = hrs < 25 ? 'green' : hrs < 48 ? 'yellow' : 'red';
            const integ  = integMap[s.site_id] || {};
            return {
                ...s, status,
                hours_since_heartbeat: Math.round(hrs),
                last_request: lastReqMap[s.site_id] || null,
                last_integ:   integ,
                has_crm:      'crm'    in integ,
                has_amelia:   'amelia' in integ,
            };
        }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Ping sito — stato in tempo reale
app.get('/api/ping/:site_id', requireAuth, async (req, res) => {
    try {
        const siteId = req.params.site_id;
        const now = new Date();
        const yesterday = new Date(now - 86400000);

        const [{ data: site }, { data: stats }, { data: lastEvt }] = await Promise.all([
            supabase.from('mon_sites').select('*').eq('site_id', siteId).single(),
            supabase.from('mon_integration_stats').select('integration, status, error_message, created_at')
                .eq('site_id', siteId).gte('created_at', yesterday.toISOString())
                .order('created_at', { ascending: false }),
            supabase.from('mon_events').select('created_at').eq('site_id', siteId)
                .eq('event_type', 'form_submitted').order('created_at', { ascending: false }).limit(1)
        ]);

        const hrs = site?.last_heartbeat ? (now - new Date(site.last_heartbeat)) / 3600000 : 9999;

        // Stato più recente per integrazione
        const integStatus = {};
        (stats || []).forEach(s => {
            if (!integStatus[s.integration]) integStatus[s.integration] = { status: s.status, error: s.error_message };
        });

        // Conteggi successo/errore ultime 24h
        const integCounts = {};
        (stats || []).forEach(s => {
            if (!integCounts[s.integration]) integCounts[s.integration] = { ok: 0, total: 0 };
            integCounts[s.integration].total++;
            if (s.status === 'ok') integCounts[s.integration].ok++;
        });

        res.json({
            site_name: site?.site_name,
            plugin_active: hrs < 25,
            hours_since_heartbeat: Math.round(hrs),
            last_heartbeat: site?.last_heartbeat,
            last_request: lastEvt?.[0]?.created_at || null,
            integ_status: integStatus,
            integ_counts: integCounts,
            checked_at: now.toISOString()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sites/:site_id', requireAuth, async (req, res) => {
    try {
        const siteId = req.params.site_id;
        const now = new Date();
        const yesterday = new Date(now - 86400000);
        const weekAgo   = new Date(now - 7 * 86400000);

        const { data: site, error: se } = await supabase
            .from('mon_sites').select('*').eq('site_id', siteId).single();
        if (se) throw se;

        const thirtyDaysAgo = new Date(now - 30 * 86400000);
        const [{ data: intStats }, { data: intTrends }, { data: logs }, { data: events }, { data: allEvents }, { count: totalSubs }] = await Promise.all([
            supabase.from('mon_integration_stats').select('*').eq('site_id', siteId).gte('created_at', yesterday.toISOString()),
            supabase.from('mon_integration_stats').select('integration, status, created_at').eq('site_id', siteId).gte('created_at', thirtyDaysAgo.toISOString()),
            supabase.from('mon_logs').select('*').eq('site_id', siteId).order('created_at', { ascending: false }).limit(20),
            supabase.from('mon_events').select('event_type, created_at').eq('site_id', siteId).gte('created_at', weekAgo.toISOString()),
            supabase.from('mon_events').select('created_at').eq('site_id', siteId).eq('event_type', 'form_submitted').gte('created_at', thirtyDaysAgo.toISOString()),
            supabase.from('mon_events').select('*', { count: 'exact', head: true }).eq('site_id', siteId).eq('event_type', 'form_submitted')
        ]);

        // Richieste per giorno (30 giorni)
        const dailyCounts = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now - i * 86400000);
            dailyCounts[d.toISOString().slice(0, 10)] = 0;
        }
        (allEvents || []).forEach(e => {
            const day = e.created_at.slice(0, 10);
            if (dailyCounts[day] !== undefined) dailyCounts[day]++;
        });

        // Andamento integrazioni per giorno (30 giorni)
        const trendDays = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now - i * 86400000);
            trendDays[d.toISOString().slice(0, 10)] = { supabase: {ok:0,tot:0}, crm: {ok:0,tot:0}, amelia: {ok:0,tot:0} };
        }
        (intTrends || []).forEach(s => {
            const day = s.created_at.slice(0, 10);
            if (trendDays[day] && trendDays[day][s.integration]) {
                trendDays[day][s.integration].tot++;
                if (s.status === 'ok') trendDays[day][s.integration].ok++;
            }
        });
        const integrationTrends = ['supabase', 'crm', 'amelia'].map(integ => ({
            integration: integ,
            data: Object.entries(trendDays).map(([date, d]) => ({
                date,
                rate: d[integ].tot > 0 ? Math.round(d[integ].ok / d[integ].tot * 100) : null
            }))
        }));

        // Stato integrazioni (ultime 24h)
        const integrationStatus = {};
        ['supabase', 'crm', 'amelia'].forEach(integ => {
            const stats = (intStats || []).filter(s => s.integration === integ);
            if (stats.length === 0) {
                integrationStatus[integ] = { status: 'grey', ok: 0, total: 0, rate: null, last_error: null };
            } else {
                const ok   = stats.filter(s => s.status === 'ok').length;
                const rate = ok / stats.length;
                integrationStatus[integ] = {
                    status: rate >= 1 ? 'green' : rate >= 0.8 ? 'yellow' : 'red',
                    ok, total: stats.length, rate: Math.round(rate * 100),
                    last_error: stats.find(s => s.status === 'error')?.error_message || null
                };
            }
        });

        const hrs = site.last_heartbeat ? (now - new Date(site.last_heartbeat)) / 3600000 : 9999;
        const heartbeatStatus = hrs < 25 ? 'green' : hrs < 48 ? 'yellow' : 'red';
        const allStatuses = [heartbeatStatus, ...Object.values(integrationStatus).map(i => i.status)].filter(s => s !== 'grey');
        const overallStatus = allStatuses.includes('red') ? 'red' : allStatuses.includes('yellow') ? 'yellow' : 'green';

        // Versione plugin
        const LATEST = { 'in3pida-form-2': '2.2.6' };
        const latestVersion = LATEST[site.plugin_name] || null;
        const versionOk = !latestVersion || site.plugin_version === latestVersion;

        // Suggerimenti automatici basati sui log
        const allMessages = (logs || []).map(l => l.message || '');
        const suggestions = [];
        if (allMessages.some(m => m.includes('BAD_CONTACT_MSISDN'))) suggestions.push({
            level: 'error',
            title: 'Numero di telefono non valido (Amelia)',
            action: 'Amelia rifiuta il numero perché non è nel formato internazionale. Vai nelle impostazioni del form e aggiungi il prefisso +39 in automatico, oppure usa il campo con validazione telefono.'
        });
        if (allMessages.some(m => m.includes('PGRST204'))) suggestions.push({
            level: 'error',
            title: 'Colonna mancante in Supabase',
            action: 'Il form sta cercando di scrivere una colonna che non esiste nella tabella Supabase. Apri le impostazioni del form → Supabase e verifica che i nomi delle colonne corrispondano a quelli della tua tabella.'
        });
        if (allMessages.some(m => m.includes('lenta') || m.includes('timeout'))) suggestions.push({
            level: 'warning',
            title: 'Supabase risponde lentamente',
            action: 'Supabase ha impiegato più di 2 secondi a rispondere. Di solito è temporaneo. Se il problema persiste, controlla il piano Supabase e la regione del progetto.'
        });
        if (!versionOk) suggestions.push({
            level: 'warning',
            title: `Versione ${site.plugin_version} — disponibile la ${latestVersion}`,
            action: `Aggiorna il plugin dalla bacheca WordPress: Plugin → in3pida Form → Aggiorna. La versione ${latestVersion} include correzioni di bug e miglioramenti.`
        });

        res.json({
            site,
            heartbeat: { status: heartbeatStatus, hours_since: Math.round(hrs), last_heartbeat: site.last_heartbeat },
            integrations: integrationStatus,
            integration_trends: integrationTrends,
            logs: logs || [],
            events_week: events?.length || 0,
            total_submissions: totalSubs || 0,
            overall_status: overallStatus,
            daily_submissions: Object.entries(dailyCounts).map(([date, count]) => ({ date, count })),
            version: { installed: site.plugin_version, latest: latestVersion, ok: versionOk },
            suggestions
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Siti con errori (ultime 24h)
app.get('/api/errors', requireAuth, async (req, res) => {
    try {
        const yesterday = new Date(Date.now() - 86400000);
        const { data: errStats } = await supabase
            .from('mon_integration_stats')
            .select('site_id, integration, error_message, created_at')
            .eq('status', 'error')
            .gte('created_at', yesterday.toISOString())
            .order('created_at', { ascending: false });

        const { data: sites } = await supabase.from('mon_sites').select('*');
        const siteMap = {};
        (sites || []).forEach(s => { siteMap[s.site_id] = s; });

        // Raggruppa per sito
        const bysite = {};
        (errStats || []).forEach(e => {
            if (!bysite[e.site_id]) bysite[e.site_id] = { site: siteMap[e.site_id], errors: [] };
            bysite[e.site_id].errors.push(e);
        });

        res.json(Object.values(bysite));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Fallback → login
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
    console.log(`✓ in3pida Monitoring avviato → http://localhost:${PORT}`);
});
