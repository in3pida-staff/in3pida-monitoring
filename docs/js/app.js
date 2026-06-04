// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const _SB = window.supabase.createClient(
    'https://yyauvoqjdzrbmebeafit.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5YXV2b3FqZHpyYm1lYmVhZml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTM2MDAsImV4cCI6MjA5NTM2OTYwMH0.M6kD56PEO_UcJ68Vjquo03vuORjv62MflIzGLzYKN9w'
);

// ─── STATE ─────────────────────────────────────────────────────────────────────
let currentView    = 'plugins';
let currentPlugin  = null;
let currentSite    = null;
let latestVersions = {};
let currentProfile = null;

// ─── HELPERS GLOBALI (usati in loadSites e loadSiteDetail) ────────────────────
const normalizeRecord = s => {
    if (s.status !== 'error' || !s.error_message) return s;
    const m = s.error_message.toLowerCase();
    if (m.includes('already') || m.includes('contact_already') || m.includes('duplicat') || m.includes('409')) {
        return {...s, status:'skipped'};
    }
    return s;
};
const isValidRecord = (s, integ) => integ !== 'crm' || s.status !== 'error' || s.error_message;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _SB.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    const { data: profile } = await _SB.from('mon_profiles').select('*').eq('id', session.user.id).single();
    if (!profile) {
        await _SB.auth.signOut();
        window.location.href = 'login.html?error=unauthorized';
        return;
    }

    currentProfile = profile;
    applyProfile(profile);

    if (profile.role === 'admin') {
        document.getElementById('nav-users').style.display = '';
    }

    await loadLatest();
    loadPlugins();
    setInterval(refresh, 60000);

    document.getElementById('nav-home').addEventListener('click', loadPlugins);
    document.getElementById('nav-plugin').addEventListener('click', loadPlugins);
    document.getElementById('nav-errors').addEventListener('click', loadErrors);
    document.getElementById('nav-users').addEventListener('click', loadUsers);
    document.getElementById('nav-info').addEventListener('click', () => {
        document.getElementById('info-overlay').style.display = 'flex';
    });

    const pill = document.getElementById('user-pill');
    const dropdown = document.getElementById('user-dropdown');
    pill.addEventListener('click', e => { e.stopPropagation(); dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none'; });
    document.addEventListener('click', () => { dropdown.style.display = 'none'; });
    dropdown.addEventListener('click', e => e.stopPropagation());

    document.getElementById('dd-logout').addEventListener('click', async () => { await _SB.auth.signOut(); window.location.href = 'login.html'; });
    document.getElementById('dd-profile').addEventListener('click', () => { dropdown.style.display = 'none'; openProfileModal(); });

    const infoOverlay = document.getElementById('info-overlay');
    document.getElementById('info-close').addEventListener('click', () => { infoOverlay.style.display = 'none'; });
    infoOverlay.addEventListener('click', e => { if (e.target === infoOverlay) infoOverlay.style.display = 'none'; });

    const profileOverlay = document.getElementById('profile-overlay');
    document.getElementById('profile-close').addEventListener('click', () => { profileOverlay.style.display = 'none'; });
    profileOverlay.addEventListener('click', e => { if (e.target === profileOverlay) profileOverlay.style.display = 'none'; });
    document.getElementById('profile-avatar-input').addEventListener('change', uploadAvatar);
    document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
});

// ─── PROFILO ─────────────────────────────────────────────────────────────────
function applyProfile(p) {
    const name = p.full_name || p.email || 'Utente';
    document.getElementById('nav-name').textContent = name;
    document.getElementById('dd-name').textContent  = name;
    document.getElementById('dd-email').textContent = p.email || '';
    ['nav-avatar','dd-avatar','profile-avatar-preview'].forEach(id => {
        const el = document.getElementById(id);
        if (p.avatar_url) el.innerHTML = `<img src="${esc(p.avatar_url)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        else              el.textContent = name.charAt(0).toUpperCase();
    });
}
function openProfileModal() {
    document.getElementById('profile-name').value  = currentProfile?.full_name  || '';
    document.getElementById('profile-email').value = currentProfile?.email || '';
    document.getElementById('profile-overlay').style.display = 'flex';
}
function uploadAvatar(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 80; canvas.height = 80;
            canvas.getContext('2d').drawImage(img, 0, 0, 80, 80);
            const avatar = canvas.toDataURL('image/jpeg', 0.85);
            currentProfile = { ...currentProfile, avatar_url: avatar };
            applyProfile(currentProfile);
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}
async function saveProfile() {
    const name = document.getElementById('profile-name').value.trim();
    if (!currentProfile) return;
    const updates = { full_name: name || currentProfile.full_name, avatar_url: currentProfile.avatar_url || null };
    await _SB.from('mon_profiles').update(updates).eq('id', currentProfile.id);
    currentProfile = { ...currentProfile, ...updates };
    applyProfile(currentProfile);
    document.getElementById('profile-overlay').style.display = 'none';
}

// ─── VERSIONI ─────────────────────────────────────────────────────────────────
async function loadLatest() {
    try {
        const r = await fetch('releases/latest.json?_=' + Date.now());
        if (r.ok) latestVersions = await r.json();
    } catch {}
}
function updateLatestVersions(sites) {
    (sites || []).forEach(s => {
        if (!s.plugin_version) return;
        const cur = latestVersions[s.plugin_name];
        const curVer = cur ? (typeof cur === 'object' ? cur.version : cur) : null;
        if (!curVer || semverGt(s.plugin_version, curVer)) {
            latestVersions[s.plugin_name] = { version: s.plugin_version, date: null };
        }
    });
}
function semverGt(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i]||0) > (pb[i]||0)) return true;
        if ((pa[i]||0) < (pb[i]||0)) return false;
    }
    return false;
}
function latestInfo(pluginName) {
    const v = latestVersions[pluginName];
    if (!v) return null;
    const version = typeof v === 'object' ? v.version : v;
    const date    = typeof v === 'object' ? v.date    : null;
    const urls = { 'in3pida-form-2': `https://raw.githubusercontent.com/in3pida-staff/in3pida-monitoring/main/docs/releases/in3pida-form-${version}.zip` };
    return { version, date, download_url: urls[pluginName] || '' };
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id); if (el) el.classList.add('active');
}
async function refresh() {
    await loadLatest();
    if      (currentView === 'plugins')              loadPlugins(true);
    else if (currentView === 'sites'  && currentPlugin) loadSites(currentPlugin, true);
    else if (currentView === 'site'   && currentSite)   loadSiteDetail(currentSite, true);
    else if (currentView === 'errors')               loadErrors(true);
}

// ─── VIEW: PLUGIN ─────────────────────────────────────────────────────────────
async function loadPlugins(silent = false) {
    currentView = 'plugins'; showView('plugins'); setActiveNav('nav-plugin');
    setBreadcrumb([{ label: 'Home', active: true }]);
    const el = document.getElementById('plugins-container');
    if (!silent) el.innerHTML = loadingHtml();

    const now = new Date();
    const yesterday = new Date(now - 86400000);
    const thirtyAgo = new Date(now - 30 * 86400000);

    const [r1, r2, r3] = await Promise.all([
        _SB.from('mon_sites').select('plugin_name, site_id, last_heartbeat, plugin_version'),
        _SB.from('mon_integration_stats').select('site_id').eq('status', 'error').gte('created_at', yesterday.toISOString()),
        _SB.from('mon_events').select('site_id, created_at').eq('event_type', 'form_submitted').gte('created_at', thirtyAgo.toISOString())
    ]);
    const err = r1.error || r2.error || r3.error;
    if (err) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Errore Supabase</div><div class="empty-sub" style="color:red;font-size:12px;max-width:600px;margin:0 auto">${esc(err.message || JSON.stringify(err))}</div></div>`; return; }
    const sites = r1.data; const errStats = r2.data; const eventsAll = r3.data;
    updateLatestVersions(sites);

    const sitesWithErrors = new Set((errStats || []).map(e => e.site_id));
    const plugins = {};
    (sites || []).forEach(s => {
        const nm = s.plugin_name;
        if (!plugins[nm]) plugins[nm] = { name: nm, total: 0, active: 0, inactive: 0, errors: 0, versions: {} };
        const hrs = s.last_heartbeat ? (now - new Date(s.last_heartbeat)) / 3600000 : 9999;
        plugins[nm].total++;
        if (hrs < 25) plugins[nm].active++; else plugins[nm].inactive++;
        if (sitesWithErrors.has(s.site_id)) plugins[nm].errors++;
        if (s.plugin_version) plugins[nm].versions[s.plugin_version] = (plugins[nm].versions[s.plugin_version] || 0) + 1;
    });
    Object.values(plugins).forEach(p => {
        p.status = (p.inactive > 0 && p.active === 0) ? 'red' : (p.inactive > 0 || p.errors > 0) ? 'yellow' : 'green';
    });

    const dailyGlobal = {};
    for (let i = 29; i >= 0; i--) { const d = new Date(now - i * 86400000); dailyGlobal[d.toISOString().slice(0,10)] = {}; }
    const sitePlugin = {}; (sites || []).forEach(s => { sitePlugin[s.site_id] = s.plugin_name; });
    (eventsAll || []).forEach(e => {
        const day = e.created_at.slice(0,10); const pn = sitePlugin[e.site_id] || 'unknown';
        if (dailyGlobal[day] !== undefined) {
            if (!dailyGlobal[day][pn]) dailyGlobal[day][pn] = new Set();
            dailyGlobal[day][pn].add(e.site_id);
        }
    });
    const pluginNames = [...new Set((sites || []).map(s => s.plugin_name))];
    const dailySeries = pluginNames.map(pn => ({ plugin: pn, data: Object.entries(dailyGlobal).map(([date, sets]) => ({ date, count: sets[pn] ? sets[pn].size : 0 })) }));

    const list = Object.values(plugins);
    if (list.length === 0) { el.innerHTML = emptyHtml('Nessun plugin registrato', 'I plugin appariranno quando i siti invieranno il primo segnale.'); setHero('Monitoring', 'in3pida Monitoring', []); return; }

    const active = list.reduce((s, p) => s + p.active, 0);
    const errors = list.reduce((s, p) => s + p.errors, 0);
    const firstPlugin = pluginNames[0] || null;
    setHero('Monitoring', 'in3pida Monitoring', [
        { num: list.length, label: 'Plugin monitorati' },
        { num: active,  label: 'Plugin attivi',    onclick: firstPlugin ? () => loadSites(firstPlugin) : null },
        { num: errors,  label: 'Siti con errori',  onclick: loadErrors },
    ]);

    el.innerHTML = `
        <p class="section-title">Plugin installati</p>
        <div class="plugins-grid">${list.map(pluginCardHtml).join('')}</div>
        ${dailySeries.length > 0 ? `<div class="card" style="margin-top:24px">
            <div class="card-header"><span class="card-title">Installazioni con richieste</span>
            <div class="chart-toggle" id="global-toggle">
                <button class="chart-toggle-btn active" data-range="7">7 giorni</button>
                <button class="chart-toggle-btn" data-range="30">30 giorni</button>
            </div></div>
            <div style="padding:20px 26px 24px"><canvas id="chart-global" height="80"></canvas></div>
        </div>` : ''}`;

    el.querySelectorAll('.plugin-card').forEach(card => card.addEventListener('click', () => loadSites(card.dataset.name)));
    document.querySelectorAll('.sw-stat-card[data-action]').forEach(c => { c.style.cursor = 'pointer'; c.addEventListener('click', () => loadErrors()); });

    if (dailySeries.length > 0 && document.getElementById('chart-global')) {
        const colors = ['#d82d6b','#009bb9','#181834']; let gc = null;
        function buildGC(range) {
            const labels = dailySeries[0].data.slice(-range).map(r => new Date(r.date).toLocaleDateString('it-IT',{day:'2-digit',month:'short'}));
            const datasets = dailySeries.map((s,i) => { const c = colors[i%colors.length]; return { label: displayName(s.plugin), data: s.data.slice(-range).map(r=>r.count), borderColor:c, borderWidth:2.5, pointBackgroundColor:c, pointRadius:3, pointHoverRadius:6, fill:i===0, backgroundColor:i===0?(ctx)=>{const g=ctx.chart.ctx.createLinearGradient(0,0,0,ctx.chart.height);g.addColorStop(0,'rgba(216,45,107,0.15)');g.addColorStop(1,'rgba(216,45,107,0)');return g;}:'transparent', tension:0.4 }; });
            if (gc) gc.destroy();
            gc = new Chart(document.getElementById('chart-global'),{ type:'line', data:{labels,datasets}, options:{ plugins:{legend:{display:dailySeries.length>1,labels:{font:{family:'Montserrat',size:11},boxWidth:12}}}, scales:{x:{grid:{display:false},ticks:{font:{family:'Montserrat',size:10},maxTicksLimit:10,color:'#999'}},y:{beginAtZero:true,ticks:{stepSize:1,font:{family:'Montserrat',size:11},color:'#999'},grid:{color:'#f4f4f8'}}}}});
        }
        buildGC(7);
        document.querySelectorAll('#global-toggle .chart-toggle-btn').forEach(btn => { btn.addEventListener('click', () => { document.querySelectorAll('#global-toggle .chart-toggle-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); buildGC(parseInt(btn.dataset.range)); }); });
    }
}

function pluginCardHtml(p) {
    const pills = Object.entries(p.versions||{}).map(([v,c]) => `<span class="version-pill">v${esc(v)}${c>1?' ×'+c:''}</span>`).join('') || '<span class="version-pill">—</span>';
    return `<div class="plugin-card ${esc(p.status)}" data-name="${esc(p.name)}">
        <div class="plugin-card-left">
            <div class="plugin-card-top">${dot(p.status,true)}<div class="plugin-card-name">${esc(displayName(p.name))}</div></div>
            <div class="plugin-card-versions">${pills}</div>
        </div>
        <div class="plugin-card-right">
            <div class="plugin-stat"><div class="plugin-stat-num">${p.total}</div><div class="plugin-stat-label">Siti installati</div></div>
            <div class="plugin-stat"><div class="plugin-stat-num online">${p.active}</div><div class="plugin-stat-label">Plugin attivi</div></div>
            <div class="plugin-stat"><div class="plugin-stat-num offline">${p.inactive}</div><div class="plugin-stat-label">Nessun segnale</div></div>
            <div class="plugin-card-arrow">›</div>
        </div>
    </div>`;
}

// ─── VIEW: ERRORI ─────────────────────────────────────────────────────────────
async function loadErrors(silent = false) {
    currentView = 'errors'; showView('errors'); setActiveNav('nav-errors');
    setBreadcrumb([{label:'Home',onclick:loadPlugins},{label:'Siti con errori',active:true}]);
    setHero('Monitoring','Siti con errori',[]);
    const el = document.getElementById('errors-container');
    if (!silent) el.innerHTML = loadingHtml();

    const yesterday = new Date(Date.now() - 86400000);
    const [{ data: errStats }, { data: allSites }] = await Promise.all([
        _SB.from('mon_integration_stats').select('site_id, integration, error_message, created_at').eq('status','error').gte('created_at', yesterday.toISOString()).order('created_at',{ascending:false}),
        _SB.from('mon_sites').select('*')
    ]);
    const siteMap = {}; (allSites||[]).forEach(s => { siteMap[s.site_id] = s; });
    const bysite = {};
    (errStats||[]).forEach(e => { if (!bysite[e.site_id]) bysite[e.site_id]={site:siteMap[e.site_id],errors:[]}; bysite[e.site_id].errors.push(e); });
    const data = Object.values(bysite);

    if (data.length === 0) {
        el.innerHTML = `<button class="btn-back" id="back-err">← Torna alla home</button>` + emptyHtml('Nessun errore nelle ultime 24h','Tutto funziona correttamente.');
        document.getElementById('back-err').addEventListener('click', loadPlugins); return;
    }
    el.innerHTML = `<button class="btn-back" id="back-err">← Torna alla home</button>
    ${data.map(item => {
        const s = item.site; const eg = {};
        (item.errors||[]).forEach(e => { const k = e.integration+':'+(e.error_message||''); eg[k]=(eg[k]||0)+1; });
        return `<div class="card" style="margin-bottom:16px">
            <div class="card-header">
                <div><span class="card-title">${esc(s?.site_name||s?.site_id)}</span><span style="font-size:12px;color:var(--grey);margin-left:10px">${esc(s?.site_url||'')}</span></div>
                <button class="btn-detail" data-site="${esc(s?.site_id)}">Vedi dettaglio →</button>
            </div>
            <div style="padding:4px 0">${Object.entries(eg).map(([k,cnt]) => { const [integ,msg]=k.split(':'); const il={supabase:'Salvataggio DB',crm:'CRM',amelia:'Amelia'}[integ]||integ; return `<div class="log-item"><span class="log-level error">errore</span><span class="log-message"><strong>${esc(il)}</strong> — ${esc(msg||'Errore sconosciuto')}</span><span class="log-time">${cnt}× nelle ultime 24h</span></div>`; }).join('')}</div>
        </div>`;
    }).join('')}`;
    document.getElementById('back-err').addEventListener('click', loadPlugins);
    el.querySelectorAll('.btn-detail').forEach(btn => btn.addEventListener('click', () => loadSiteDetail(btn.dataset.site)));
}

// ─── VIEW: SITI ───────────────────────────────────────────────────────────────
async function loadSites(pluginName, silent = false) {
    currentPlugin = pluginName; currentView = 'sites'; showView('sites');
    setBreadcrumb([{label:'Home',onclick:loadPlugins},{label:displayName(pluginName),active:true}]);
    const el = document.getElementById('sites-container');
    if (!silent) el.innerHTML = loadingHtml();

    const yesterday = new Date(Date.now() - 86400000);
    const { data: sites } = await _SB.from('mon_sites').select('*').eq('plugin_name', pluginName).order('last_heartbeat',{ascending:false});
    updateLatestVersions(sites);
    const siteIds = (sites||[]).map(s => s.site_id);

    let lastEvents = [], recentStats = [];
    if (siteIds.length > 0) {
        const [le, rs] = await Promise.all([
            _SB.from('mon_events').select('site_id, created_at').in('site_id', siteIds).eq('event_type','form_submitted').order('created_at',{ascending:false}),
            _SB.from('mon_integration_stats').select('site_id, integration, status, error_message, created_at').in('site_id', siteIds).gte('created_at', yesterday.toISOString()).order('created_at',{ascending:false})
        ]);
        lastEvents = le.data || [];
        recentStats = rs.data || [];
    }

    const lastReqMap = {};
    lastEvents.forEach(e => { if (!lastReqMap[e.site_id]) lastReqMap[e.site_id] = e.created_at; });
    const integMap = {};
    recentStats.forEach(raw => { const s = normalizeRecord(raw); if (!integMap[s.site_id]) integMap[s.site_id]={}; if (!integMap[s.site_id][s.integration] && isValidRecord(s, s.integration)) integMap[s.site_id][s.integration]=s.status; });

    const now = new Date();
    const enriched = (sites||[]).map(s => {
        const hrs = s.last_heartbeat ? (now - new Date(s.last_heartbeat))/3600000 : 9999;
        return { ...s, status: hrs<25?'green':hrs<48?'yellow':'red', hours_since_heartbeat: Math.round(hrs), last_request: lastReqMap[s.site_id]||null, last_integ: integMap[s.site_id]||{} };
    });

    const active = enriched.filter(s=>s.status==='green').length;
    const inactive = enriched.filter(s=>s.status!=='green').length;
    const filterRows = f => el.querySelectorAll('tr[data-site-id]').forEach(r => {
        r.style.display = f===null||(f==='green'&&r.dataset.status==='green')||(f==='inactive'&&r.dataset.status!=='green') ? '' : 'none';
    });
    const li = latestInfo(pluginName);
    setHero(displayName(pluginName), displayName(pluginName), [
        { num: enriched.length, label: 'Siti installati', onclick: () => filterRows(null) },
        { num: active,          label: 'Plugin attivi',   onclick: () => filterRows('green') },
        { num: inactive,        label: 'Senza segnale',   onclick: () => filterRows('inactive') },
        { num: '↑', display: li ? `${li.version}${li.date?`<div style="font-size:.7rem;font-weight:400;color:#aaa;margin-top:2px">${li.date}</div>`:''}` : '—', label: 'Ultima versione' },
    ]);

    if (enriched.length === 0) { el.innerHTML = emptyHtml('Nessuna installazione','Le installazioni appariranno quando i siti invieranno il primo segnale.'); return; }

    el.innerHTML = `
        <button class="btn-back" id="back-to-plugins">← Torna ai plugin</button>
        <div class="card">
            <div class="card-header"><span class="card-title">Installazioni — ${esc(displayName(pluginName))}</span><div style="display:flex;align-items:center;gap:12px"><span style="font-size:12px;color:var(--grey)">${enriched.length} siti</span>${enriched.some(s=>{const lr=latestInfo(s.plugin_name);return lr&&s.plugin_version&&semverGt(lr.version,s.plugin_version);})?`<button class="btn-update" id="btn-update-all">Aggiorna tutti</button>`:''}</div></div>
            <table class="sites-table"><thead><tr><th>Stato</th><th>Sito</th><th>Ultima richiesta</th><th>Database / CRM / Amelia</th><th>Funzionalità</th><th>Ver.</th><th>Installato il</th><th>Azioni</th></tr></thead>
            <tbody>${enriched.map(siteRowHtml).join('')}</tbody></table>
        </div>`;

    document.getElementById('back-to-plugins').addEventListener('click', loadPlugins);

    const btnUpdateAll = document.getElementById('btn-update-all');
    if (btnUpdateAll) {
        btnUpdateAll.addEventListener('click', async () => {
            const outdatedBtns = [...el.querySelectorAll('.btn-update-row[data-outdated="1"]')];
            if (!outdatedBtns.length) return;
            if (!confirm(`Aggiornare ${outdatedBtns.length} siti all'ultima versione?`)) return;
            btnUpdateAll.textContent = 'Aggiornamento in corso...';
            btnUpdateAll.disabled = true;
            for (const btn of outdatedBtns) {
                await updatePlugin(btn.dataset.site, btn.dataset.url, btn.dataset.apikey, btn.dataset.dl, btn, () => {}, true);
            }
            btnUpdateAll.textContent = 'Tutti aggiornati!';
            setTimeout(() => loadSites(currentPlugin), 3000);
        });
    }

    el.querySelectorAll('tr[data-site-id]').forEach(row => { row.addEventListener('click', e => { if (e.target.closest('.btn-ping') || e.target.closest('.btn-update-row')) return; loadSiteDetail(row.dataset.siteId); }); });
    el.querySelectorAll('.btn-update-row').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            if (btn.dataset.outdated !== '1') {
                alert('✓ Ultima versione già installata.');
                return;
            }
            await updatePlugin(btn.dataset.site, btn.dataset.url, btn.dataset.apikey, btn.dataset.dl, btn);
        });
    });
    el.querySelectorAll('.btn-ping').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const name   = btn.dataset.name;
            const siteUrl = btn.dataset.url;
            const apiKey  = btn.dataset.apikey;
            btn.textContent = '...'; btn.disabled = true;
            try { const d = await pingLive(siteUrl, apiKey); showPingResult(name, d); }
            catch { showPingResult(name, null); }
            finally { btn.textContent = 'Testa ora'; btn.disabled = false; }
        });
    });
}

function siteRowHtml(s) {
    const integ = s.last_integ || {};
    const configured = { supabase: s.has_supabase, crm: s.has_crm, amelia: s.has_amelia };
    const dotFor = key => { const st = integ[key]; const conf = configured[key]; if (!conf) return `<span class="integ-dot grey" title="${key}: non configurato"></span>`; if (st===undefined||st===null) return `<span class="integ-dot dot-ok" title="${key}: configurato"></span>`; if (st==='ok'||st==='info'||st==='skipped') return `<span class="integ-dot dot-ok" title="${key}: ok"></span>`; if (st==='error') return `<span class="integ-dot dot-error" title="${key}: errore"></span>`; return `<span class="integ-dot dot-pending" title="${key}: ${st}"></span>`; };
    return `<tr data-site-id="${esc(s.site_id)}" data-status="${esc(s.status)}">
        <td>${dot(s.status)}</td>
        <td><div class="site-name-cell">${esc(s.site_name||s.site_url||s.site_id)}</div><div class="site-url-cell">${esc(s.site_url||'')}</div></td>
        <td style="font-size:12px;color:var(--grey)">${s.last_request?timeAgo(s.last_request):'—'}</td>
        <td><div class="integ-dots-row"><span class="integ-dots-label">Database</span>${dotFor('supabase')}<span class="integ-dots-label">CRM</span>${dotFor('crm')}<span class="integ-dots-label">Amelia</span>${dotFor('amelia')}</div></td>
        <td style="font-size:12px">${(()=>{const off=[];if(s.feature_stats===false||s.feature_stats===0)off.push('Statistiche');if(s.feature_crm_tab===false||s.feature_crm_tab===0)off.push('CRM');if(s.feature_settings_tab===false||s.feature_settings_tab===0)off.push('Impostazioni');return off.length?off.map(f=>`<span style="color:var(--magenta);font-weight:700">${f} OFF</span>`).join('<br>'):'<span style="color:var(--cyan);font-weight:700">✓ Tutte attive</span>';})()}</td>
        <td style="font-size:12px;color:var(--grey);white-space:nowrap">${esc(s.plugin_version||'—')}${(()=>{const lr=latestInfo(s.plugin_name);return lr&&s.plugin_version&&semverGt(lr.version,s.plugin_version)?`<span class="version-badge warn" style="margin-left:6px;font-size:10px;padding:2px 6px">old</span>`:''})()}</td>
        <td style="font-size:12px;color:var(--grey);white-space:nowrap">${fmtDate(s.first_seen)}</td>
        <td style="white-space:nowrap">
            <button class="btn-ping" data-site="${esc(s.site_id)}" data-url="${esc(s.site_url||'')}" data-apikey="${esc(s.api_key||'')}" data-name="${esc(s.site_name||s.site_id)}">Testa ora</button>
            ${(()=>{const lr=latestInfo(s.plugin_name);const outdated=lr&&s.plugin_version&&semverGt(lr.version,s.plugin_version);return `<button class="btn-update btn-update-row" data-site="${esc(s.site_id)}" data-url="${esc(s.site_url||'')}" data-apikey="${esc(s.api_key||'')}" data-dl="${esc(lr?lr.download_url:'')}" data-outdated="${outdated?'1':'0'}">${outdated?'Aggiorna':'✓ Aggiornato'}</button>`;})()}
        </td>
    </tr>`;
}

// ─── VIEW: DETTAGLIO SITO ─────────────────────────────────────────────────────
async function loadSiteDetail(siteId, silent = false) {
    currentSite = siteId; currentView = 'site'; showView('site');
    const el = document.getElementById('site-container');
    if (!silent) el.innerHTML = loadingHtml();

    const now = new Date();
    const yesterday = new Date(now - 86400000);
    const weekAgo   = new Date(now - 7  * 86400000);
    const thirtyAgo = new Date(now - 30 * 86400000);

    const { data: site, error: se } = await _SB.from('mon_sites').select('*').eq('site_id', siteId).single();
    if (se) { el.innerHTML = errorHtml(); return; }

    const [{ data: intStats }, { data: intTrends }, { data: logs }, { data: events }, { data: allEvents }, { count: totalSubs }] = await Promise.all([
        _SB.from('mon_integration_stats').select('*').eq('site_id',siteId).gte('created_at', yesterday.toISOString()),
        _SB.from('mon_integration_stats').select('integration, status, created_at').eq('site_id',siteId).gte('created_at', thirtyAgo.toISOString()),
        _SB.from('mon_logs').select('*').eq('site_id',siteId).order('created_at',{ascending:false}).limit(20),
        _SB.from('mon_events').select('event_type, created_at').eq('site_id',siteId).gte('created_at', weekAgo.toISOString()),
        _SB.from('mon_events').select('created_at').eq('site_id',siteId).eq('event_type','form_submitted').gte('created_at', thirtyAgo.toISOString()),
        _SB.from('mon_events').select('*',{count:'exact',head:true}).eq('site_id',siteId).eq('event_type','form_submitted')
    ]);

    const dailyCounts = {};
    for (let i=29;i>=0;i--) { const d=new Date(now-i*86400000); dailyCounts[d.toISOString().slice(0,10)]=0; }
    (allEvents||[]).forEach(e => { const day=e.created_at.slice(0,10); if(dailyCounts[day]!==undefined) dailyCounts[day]++; });

    const trendDays = {};
    for (let i=29;i>=0;i--) { const d=new Date(now-i*86400000); trendDays[d.toISOString().slice(0,10)]={supabase:{ok:0,tot:0},crm:{ok:0,tot:0},amelia:{ok:0,tot:0}}; }

    (intTrends||[]).forEach(raw => {
        let s = normalizeRecord(raw);
        // CRM error senza messaggio = CRM esterno (hotel_id), non è un vero errore
        if (s.integration === 'crm' && s.status === 'error' && !s.error_message) s = {...s, status:'skipped'};
        const day=s.created_at.slice(0,10);
        if(trendDays[day]&&trendDays[day][s.integration]){
            trendDays[day][s.integration].tot++;
            // Amelia: solo 'ok' conta (info=duplicato, skipped=altro 4xx non entrano nel conteggio)
            // Supabase/CRM: ok + info + skipped tutti contano
            const isOk = s.integration==='amelia'
                ? s.status==='ok'
                : (s.status==='ok'||s.status==='info'||s.status==='skipped');
            if(isOk) trendDays[day][s.integration].ok++;
        }
    });
    const integrationTrends = ['supabase','crm','amelia'].map(integ => ({ integration:integ, data:Object.entries(trendDays).map(([date,d])=>({date,rate:d[integ].tot>0?Math.round(d[integ].ok/d[integ].tot*100):null})) }));

    const integrationStatus = {};
    ['supabase','crm','amelia'].forEach(integ => {
        let stats = (intStats||[]).filter(s=>s.integration===integ)
            .filter(s => isValidRecord(s, integ))
            .map(normalizeRecord)
            .map(s => (integ==='crm' && s.status==='error' && !s.error_message) ? {...s,status:'skipped'} : s);
        const configured = !!site['has_' + integ];
        if (!stats.length) {
            // CRM configurato ma senza invii tracciati (gestito esternamente) → verde
            integrationStatus[integ]={status:(integ==='crm'&&configured)?'green':'grey',ok:0,total:0,rate:null,last_error:null,configured};
            return;
        }
        const ok = stats.filter(s => integ==='amelia' ? s.status==='ok' : (s.status==='ok'||s.status==='info'||s.status==='skipped')).length;
        const rate = ok/stats.length;
        // Dot basato sul tasso di errori veri per tutti e 3: skipped/info non sono errori
        const errCount = stats.filter(s => s.status === 'error').length;
        const errRate  = errCount / stats.length;
        const status   = errRate === 0 ? 'green' : errRate < 0.5 ? 'yellow' : 'red';
        integrationStatus[integ]={status,ok,total:stats.length,rate:Math.round(rate*100),last_error:stats.find(s=>s.status==='error')?.error_message||null,configured};
    });

    const hrs = site.last_heartbeat ? (now - new Date(site.last_heartbeat))/3600000 : 9999;
    const heartbeatStatus = hrs<25?'green':hrs<48?'yellow':'red';
    const allStatuses = [heartbeatStatus,...Object.values(integrationStatus).map(i=>i.status)].filter(s=>s!=='grey');
    const overallStatus = allStatuses.includes('red')?'red':allStatuses.includes('yellow')?'yellow':'green';

    const li            = latestInfo(site.plugin_name);
    const latestVersion = li ? li.version : null;
    const latestDownloadUrl = li ? li.download_url : null;
    const versionOk = !latestVersion || !semverGt(latestVersion, site.plugin_version);

    const allMessages = (logs||[]).map(l=>l.message||'');
    const suggestions = [];
    if (allMessages.some(m=>m.includes('BAD_CONTACT_MSISDN'))) suggestions.push({level:'error',title:'Numero di telefono non valido (Amelia)',action:'Amelia rifiuta il numero perché non è nel formato internazionale. Usa il campo telefono con validazione attiva.'});
    if (allMessages.some(m=>m.includes('PGRST204'))) suggestions.push({level:'error',title:'Colonna mancante in Supabase',action:'Il form cerca una colonna che non esiste. Verifica i nomi delle colonne nelle impostazioni del form → Supabase.'});
    if (!versionOk) suggestions.push({level:'warning',title:`Versione ${site.plugin_version} — disponibile la ${latestVersion}`,action:site.api_key&&latestDownloadUrl?`Usa il pulsante "Aggiorna ora" in Informazioni sito.`:`Aggiorna il plugin da WordPress: Plugin → in3pida Form → Aggiorna.`});

    const siteName   = site.site_name || site.site_url || siteId;
    const pluginName = site.plugin_name;
    setBreadcrumb([{label:'Home',onclick:loadPlugins},{label:displayName(pluginName),onclick:()=>loadSites(pluginName)},{label:siteName,active:true}]);
    setHero(displayName(pluginName), siteName, [{num:totalSubs||0,label:'Richieste totali'},{num:events?.length||0,label:'Ultimi 7 giorni'}]);

    const integLabels = {supabase:'Database',crm:'CRM',amelia:'Amelia'};

    el.innerHTML = `
        <button class="btn-back" id="back-to-sites">← Torna ai siti — ${esc(displayName(pluginName))}</button>
        ${suggestions.length>0?`<div class="card">${suggestions.map(s=>`<div class="suggestion-item ${esc(s.level)}"><div class="suggestion-title">${esc(s.title)}</div><div class="suggestion-action">${esc(s.action)}</div></div>`).join('')}</div>`:''}
        <div class="detail-grid">
            <div class="card">
                <div class="card-header"><span class="card-title">Stato semafori</span></div>
                <div class="semaforo-general">${dot(overallStatus,true)}<span>Stato generale: <strong>${statusLabel(overallStatus)}</strong></span></div>
                <div class="semaforo-row">${dot(heartbeatStatus)}<span class="semaforo-label">Plugin attivo sul sito</span><span class="semaforo-detail">Ultimo segnale: ${timeAgo(site.last_heartbeat)}</span></div>
                ${Object.entries(integrationStatus).map(([k,v])=>`<div class="semaforo-row">${dot(v.status)}<span class="semaforo-label">${integLabels[k]||k}</span><span class="semaforo-detail">${v.total>0?`${v.ok}/${v.total} ok (${v.rate}%)${v.last_error?' — '+v.last_error.substring(0,40):''}` : v.configured ? (k==='crm'?'Attivo — gestito esternamente':'Configurata — nessun invio nelle ultime 24h') : 'Non configurata su questo sito'}</span></div>`).join('')}
            </div>
            <div class="card">
                <div class="card-header"><span class="card-title">Informazioni sito</span></div>
                ${latestVersion&&!versionOk?`<div style="padding:12px 26px 0"><div class="version-row"><span>Versione installata: <strong>${esc(site.plugin_version)}</strong></span><span class="version-badge warn">Disponibile: v${esc(latestVersion)}</span>${site.api_key&&latestDownloadUrl?`<button class="btn-update" id="btn-do-update">Aggiorna ora</button>`:''}</div></div>`:''}
                <div class="info-grid">
                    ${infoRow('Sito',site.site_name)}${infoRow('URL',site.site_url)}${infoRow('Plugin ver.',site.plugin_version)}${infoRow('WordPress',site.wp_version)}${infoRow('PHP',site.php_version)}${infoRow('Tema attivo',site.theme_active)}${infoRow('Installato il',fmtDate(site.first_seen))}${infoRow('Site ID',site.site_id,true)}
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-header"><span class="card-title">Richieste ricevute giorno per giorno</span>
            <div class="chart-toggle" id="sub-toggle"><button class="chart-toggle-btn active" data-range="7">7 giorni</button><button class="chart-toggle-btn" data-range="30">30 giorni</button></div></div>
            <div style="padding:20px 26px 24px"><canvas id="chart-submissions" height="80"></canvas></div>
        </div>
        ${(()=>{
            const rows = ['supabase','crm','amelia'].map(integ => { const t=integrationTrends.find(x=>x.integration===integ); if(!t)return null; return {integ,label:{supabase:'Salvataggio DB',crm:'CRM',amelia:'Amelia'}[integ],data:t.data.slice(-14)}; }).filter(Boolean);
            if (!rows.some(r=>r.data.some(x=>x.rate!==null))) return '';
            const dls = rows[0].data.map(r=>new Date(r.date).toLocaleDateString('it-IT',{day:'2-digit',month:'short'}));
            return `<div class="card"><div class="card-header"><span class="card-title">Funzionamento integrazioni — ultimi 14 giorni</span></div><div style="padding:16px 26px 20px;overflow-x:auto"><table class="heatmap-table"><thead><tr><th></th>${dls.map(l=>`<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><td class="heatmap-row-label">${row.label}</td>${row.data.map(r=>{if(r.rate===null)return`<td><span class="heatmap-cell empty">—</span></td>`;const cls=row.integ==='amelia'?'ok':r.rate===100?'ok':'err';return`<td><span class="heatmap-cell ${cls}">${r.rate}%</span></td>`;}).join('')}</tr>`).join('')}</tbody></table></div></div>`;
        })()}
        <div class="stat-cards-row">
            <div class="stat-big-card magenta"><div class="stat-big-num">${totalSubs||0}</div><div class="stat-big-label">Richieste ricevute in totale</div></div>
            <div class="stat-big-card cyan"><div class="stat-big-num">${events?.length||0}</div><div class="stat-big-label">Richieste negli ultimi 7 giorni</div></div>
            <div class="stat-big-card"><div class="stat-big-num">${rateLabel(integrationStatus.supabase)}</div><div class="stat-big-label">Salvataggio DB (ultime 24h)</div></div>
            <div class="stat-big-card"><div class="stat-big-num">${rateLabel(integrationStatus.crm)}</div><div class="stat-big-label">Invio CRM (ultime 24h)</div></div>
            <div class="stat-big-card"><div class="stat-big-num">${rateLabel(integrationStatus.amelia)}</div><div class="stat-big-label">Amelia (ultime 24h)</div></div>
        </div>
        <div class="card" id="card-features">
            <div class="card-header"><span class="card-title">Funzionalità</span></div>
            <div style="padding:4px 26px 16px">
                ${[
                    {key:'if2_feature_stats',        label:'Statistiche',            val:site.feature_stats},
                    {key:'if2_feature_crm_tab',      label:'Integrazione CRM',       val:site.feature_crm_tab},
                    {key:'if2_feature_settings_tab', label:'Impostazioni in3pida',   val:site.feature_settings_tab},
                    {key:'__semafori__',             label:'Semafori DB / CRM / Amelia', val:site.feature_dot_db!==false&&site.feature_dot_db!==0&&site.feature_dot_crm!==false&&site.feature_dot_crm!==0&&site.feature_dot_amelia!==false&&site.feature_dot_amelia!==0},
                ].map(f=>{const on=f.val!==false&&f.val!==0;return`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f4f4f8"><span style="font-size:.85rem;font-weight:600;color:#333">${esc(f.label)}</span><div style="display:flex;align-items:center;gap:10px"><span style="font-size:.78rem;font-weight:700;color:${on?'var(--cyan)':'var(--magenta)'}">${on?'Attiva':'Disattiva'}</span><button class="btn-feature-toggle" data-key="${esc(f.key)}" data-value="${on?0:1}" data-site="${esc(siteId)}" data-url="${esc(site.site_url||'')}" data-apikey="${esc(site.api_key||'')}" style="width:44px;height:26px;border-radius:13px;background:${on?'var(--cyan)':'var(--magenta)'};border:none;cursor:pointer;position:relative;padding:0;flex-shrink:0"><span style="width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:3px;left:${on?'21px':'3px'};display:block;box-shadow:0 1px 3px rgba(0,0,0,.25)"></span></button></div></div>`;}).join('')}
            </div>
        </div>
        <div class="card">
            <div class="card-header"><span class="card-title">Log recenti</span><span style="font-size:12px;color:var(--grey)">Ultimi 20</span></div>
            ${logs?.length>0?'<div>'+logs.map(logRowHtml).join('')+'</div>':emptyHtml('Nessun log','Nessun errore registrato.')}
        </div>`;

    document.getElementById('back-to-sites').addEventListener('click', () => loadSites(pluginName));

    const btnDoUpdate = document.getElementById('btn-do-update');
    if (btnDoUpdate) {
        btnDoUpdate.addEventListener('click', () => updatePlugin(siteId, site.site_url, site.api_key, latestDownloadUrl, btnDoUpdate));
    }

    el.querySelectorAll('.btn-enable-crm').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.textContent = 'Attivazione...'; btn.disabled = true;
            try {
                const resp = await fetch(btn.dataset.url.replace(/\/$/, '') + '/wp-json/if2/v1/set-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: btn.dataset.apikey, key: 'if2_has_crm_override', value: 1 }),
                });
                const json = await resp.json().catch(() => ({}));
                if (resp.ok && json.success) {
                    btn.textContent = 'CRM attivato!';
                    btn.style.background = 'var(--cyan)';
                    setTimeout(() => loadSiteDetail(btn.dataset.site), 3000);
                } else {
                    btn.textContent = 'Errore'; btn.disabled = false;
                }
            } catch { btn.textContent = 'Errore connessione'; btn.disabled = false; }
        });
    });

    el.querySelectorAll('.btn-feature-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key    = btn.dataset.key;
            const value  = parseInt(btn.dataset.value); // valore da impostare (0 o 1)
            const sid    = btn.dataset.site;
            const url    = btn.dataset.url;
            const apiKey = btn.dataset.apikey;
            const nowOn  = value === 1; // nuovo stato dopo il click

            // Aggiornamento visivo immediato
            btn.style.background    = nowOn ? 'var(--cyan)' : 'var(--magenta)';
            btn.style.pointerEvents = 'none';
            const knob = btn.querySelector('span');
            if (knob) knob.style.left = nowOn ? '21px' : '3px';
            const stateLabel = btn.parentElement.querySelector('span:first-child');
            if (stateLabel) { stateLabel.textContent = nowOn ? 'Attiva' : 'Disattiva'; stateLabel.style.color = nowOn ? 'var(--cyan)' : 'var(--magenta)'; }
            btn.dataset.value = nowOn ? 0 : 1;

            try {
                if (key === '__semafori__') {
                    const {error: sbErr} = await _SB.from('mon_sites').update({feature_dot_db: nowOn, feature_dot_crm: nowOn, feature_dot_amelia: nowOn}).eq('site_id', sid);
                    if (sbErr) throw new Error(sbErr.message);
                    if (url && apiKey) {
                        for (const k of ['if2_feature_dot_db','if2_feature_dot_crm','if2_feature_dot_amelia']) {
                            fetch(url.replace(/\/$/, '') + '/wp-json/if2/v1/set-config', {
                                method: 'POST', headers: {'Content-Type':'application/json'},
                                body: JSON.stringify({ api_key: apiKey, key: k, value }),
                            }).catch(()=>{});
                        }
                    }
                } else {
                    const sbKey = {if2_feature_stats:'feature_stats',if2_feature_crm_tab:'feature_crm_tab',if2_feature_settings_tab:'feature_settings_tab'}[key];
                    if (sbKey) { const {error:e} = await _SB.from('mon_sites').update({[sbKey]: nowOn}).eq('site_id', sid); if(e) throw new Error(e.message); }
                    if (url && apiKey) {
                        fetch(url.replace(/\/$/, '') + '/wp-json/if2/v1/set-config', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({ api_key: apiKey, key, value }),
                        }).catch(()=>{});
                    }
                }
            } catch(err) {
                // Ripristina stato precedente in caso di errore
                const wasOn = !nowOn;
                btn.style.background = wasOn ? 'var(--cyan)' : 'var(--magenta)';
                if (knob) knob.style.left = wasOn ? '21px' : '3px';
                if (stateLabel) { stateLabel.textContent = wasOn ? 'Attiva' : 'Disattiva'; stateLabel.style.color = wasOn ? 'var(--cyan)' : 'var(--magenta)'; }
                btn.dataset.value = value;
                console.error('Toggle error:', err.message);
            } finally {
                btn.style.pointerEvents = '';
            }
        });
    });

    const dailySubs = Object.entries(dailyCounts).map(([date,count])=>({date,count}));
    if (dailySubs.length > 0) buildLineChart('chart-submissions','sub-toggle',[{color:'#d82d6b',data:dailySubs,fill:true}],7);
}

// ─── UPDATE PLUGIN ────────────────────────────────────────────────────────────
async function updatePlugin(siteId, siteUrl, apiKey, downloadUrl, btn, onSuccess, skipConfirm) {
    if (!skipConfirm && !confirm('Aggiornare il plugin su ' + siteUrl + '?\n\nIl sito resterà attivo durante l\'operazione.')) return;
    btn.textContent = 'Aggiornamento in corso...';
    btn.disabled = true;
    try {
        const resp = await fetch(siteUrl.replace(/\/$/, '') + '/wp-json/if2/v1/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, download_url: downloadUrl }),
        });
        let json = {};
        try { json = await resp.json(); } catch {}
        if (resp.ok && json.success) {
            btn.textContent = 'Aggiornato!';
            btn.style.background = 'var(--cyan)';
            btn.style.color = 'white';
            // Pinga il sito dopo 2s: questo carica il nuovo codice PHP e triggera
            // il heartbeat con la versione corretta. Poi ricarica dopo altri 3s.
            setTimeout(async () => {
                try { await pingLive(siteUrl, apiKey); } catch {}
                setTimeout(() => onSuccess ? onSuccess() : loadSiteDetail(siteId), 3000);
            }, 2000);
        } else {
            btn.textContent = 'Errore — riprova';
            btn.style.background = 'var(--red, #ef4444)';
            btn.style.color = 'white';
            alert('Errore aggiornamento: ' + (json.error || 'Risposta non valida dal server'));
            setTimeout(() => { btn.textContent = 'Aggiorna ora'; btn.disabled = false; btn.style.background = ''; btn.style.color = ''; }, 4000);
        }
    } catch (e) {
        btn.textContent = 'Errore connessione';
        btn.style.background = 'var(--red, #ef4444)';
        btn.style.color = 'white';
        alert('Impossibile contattare il sito:\n' + e.message);
        setTimeout(() => { btn.textContent = 'Aggiorna ora'; btn.disabled = false; btn.style.background = ''; btn.style.color = ''; }, 4000);
    }
}

// ─── PING LIVE ────────────────────────────────────────────────────────────────
async function pingLive(siteUrl, apiKey) {
    const now = new Date();
    if (!siteUrl) throw new Error('URL mancante');
    const base = siteUrl.replace(/\/$/, '');
    const endpoint = base + '/wp-json/if2/v1/status' + (apiKey ? '?api_key=' + encodeURIComponent(apiKey) : '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const resp = await fetch(endpoint, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) return { reachable: false, status: resp.status, checked_at: now.toISOString() };
        const json = await resp.json();
        return { reachable: true, plugin_version: json.plugin_version, wp_version: json.wp_version, php_version: json.php_version, checked_at: now.toISOString() };
    } catch(e) {
        clearTimeout(timeout);
        throw e;
    }
}

function showPingResult(name, d) {
    document.getElementById('ping-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'ping-modal'; modal.className = 'ping-overlay';
    let body = '';
    if (!d) {
        body = `<div style="padding:20px;color:var(--grey)">Sito non raggiungibile o timeout.</div>`;
    } else if (!d.reachable) {
        body = `<div class="ping-row">${dot('red')}<span>Sito non risponde</span><span style="margin-left:auto;font-size:12px;color:var(--grey)">HTTP ${d.status||'—'}</span></div><div style="font-size:11px;color:#bbb;padding-top:12px;text-align:right">Verificato adesso</div>`;
    } else {
        body = `
        <div class="ping-row" style="border-bottom:1px solid #f4f4f8;padding-bottom:12px;margin-bottom:12px">
            ${dot('green')}<span style="font-weight:700">Plugin attivo e raggiungibile</span>
        </div>
        <div class="ping-row"><span style="color:var(--grey)">Versione plugin</span><span style="margin-left:auto;font-weight:700">${esc(d.plugin_version||'—')}</span></div>
        <div class="ping-row"><span style="color:var(--grey)">WordPress</span><span style="margin-left:auto;font-weight:700">${esc(d.wp_version||'—')}</span></div>
        <div class="ping-row"><span style="color:var(--grey)">PHP</span><span style="margin-left:auto;font-weight:700">${esc(d.php_version||'—')}</span></div>
        <div style="font-size:11px;color:#bbb;padding-top:12px;text-align:right">Verificato adesso</div>`;
    }
    modal.innerHTML = `<div class="ping-card"><div class="ping-header"><span class="ping-title">${esc(name)}</span><button class="ping-close" id="ping-close">✕</button></div>${body}</div>`;
    document.body.appendChild(modal);
    document.getElementById('ping-close').addEventListener('click', ()=>modal.remove());
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}

// ─── GRAFICO LINEE ────────────────────────────────────────────────────────────
function buildLineChart(canvasId, toggleId, series, defaultRange, unit='') {
    let chart = null;
    function build(range) {
        const labels = series[0].data.slice(-range).map(r => new Date(r.date).toLocaleDateString('it-IT',{day:'2-digit',month:'short'}));
        const datasets = series.map(s => ({ label:s.label||'', data:s.data.slice(-range).map(r=>r.count), borderColor:s.color, borderWidth:2.5, pointBackgroundColor:s.color, pointRadius:3, pointHoverRadius:6, fill:s.fill||false, backgroundColor:s.fill?(ctx)=>{const g=ctx.chart.ctx.createLinearGradient(0,0,0,ctx.chart.height);g.addColorStop(0,s.color+'28');g.addColorStop(1,s.color+'00');return g;}:'transparent', tension:0.4, spanGaps:true }));
        if (chart) chart.destroy();
        chart = new Chart(document.getElementById(canvasId),{ type:'line', data:{labels,datasets}, options:{ plugins:{legend:{display:series.length>1,labels:{font:{family:'Montserrat',size:11},boxWidth:12}},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.y}${unit}`}}}, scales:{x:{grid:{display:false},ticks:{font:{family:'Montserrat',size:10},maxTicksLimit:10,color:'#999'}},y:{beginAtZero:true,ticks:{font:{family:'Montserrat',size:11},color:'#999',callback:v=>v+unit},grid:{color:'#f4f4f8'}}}}});
    }
    build(defaultRange);
    document.querySelectorAll(`#${toggleId} .chart-toggle-btn`).forEach(btn => { btn.addEventListener('click', () => { document.querySelectorAll(`#${toggleId} .chart-toggle-btn`).forEach(b=>b.classList.remove('active')); btn.classList.add('active'); build(parseInt(btn.dataset.range)); }); });
}

function logRowHtml(log) {
    return `<div class="log-item"><span class="log-level ${esc(log.level)}">${esc(log.level)}</span><span class="log-message">${esc(log.message)}</span><span class="log-time">${timeAgo(log.created_at)}</span></div>`;
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function showView(view) { ['plugins','sites','site','errors','users'].forEach(v => document.getElementById(`view-${v}`).style.display = v===view?'':'none'); }
function setHero(label, title, stats) {
    document.getElementById('hero-label').textContent = label;
    document.getElementById('hero-title').textContent = title;
    const el = document.getElementById('sw-stats');
    if (stats&&stats.length>0) {
        el.style.display='';
        const colors=['var(--magenta)','var(--cyan)','var(--dark)'];
        el.innerHTML=stats.map((s,i)=>{const bg=s.color||colors[i%colors.length];const icon=s.icon!==undefined?s.icon:s.num;const display=s.display!==undefined?s.display:s.num;return`<div class="sw-stat-card" data-i="${i}" style="${s.onclick?'cursor:pointer;':''}"><div class="sw-stat-icon" style="background:${bg}">${icon}</div><div class="sw-stat-text"><div class="sw-stat-num">${display}</div><div class="sw-stat-label">${s.label}</div></div></div>`;}).join('');
        stats.forEach((s,i)=>{ if(s.onclick){ const card=el.querySelector(`[data-i="${i}"]`); if(card) card.addEventListener('click', s.onclick); } });
    } else el.style.display='none';
}
function setBreadcrumb(items) {
    const el = document.getElementById('breadcrumb');
    el.innerHTML = items.map((item,i) => { const sep = i>0?'<span class="breadcrumb-sep">›</span>':''; const cls = item.active?'breadcrumb-item active':'breadcrumb-item'; return `${sep}<span class="${cls}" data-i="${i}">${esc(item.label)}</span>`; }).join('');
    items.forEach((item,i) => { if (item.onclick) { const n=el.querySelector(`[data-i="${i}"]`); if(n) n.addEventListener('click',item.onclick); } });
}
function infoRow(label, value, small=false) { return `<div class="info-row"><div class="info-label">${esc(label)}</div><div class="info-value"${small?' style="font-size:11px;color:var(--grey)"':''}>${esc(value||'—')}</div></div>`; }
function rateLabel(integ) { if (!integ||integ.total===0) return '—'; return integ.rate+'%'; }

function displayName(name) { return {'in3pida-form-2':'in3pida Form 2.0','smart-working':'Smart Working','llm-positioning':'Plugin LLM'}[name]||name; }
function dot(status, lg=false) { return `<span class="dot${lg?' lg':''} ${esc(status)}"></span>`; }
function statusLabel(s) { return {green:'Tutto OK',yellow:'Attenzione',red:'Errore',grey:'N/D'}[s]||s; }
function timeAgo(dateStr) { if(!dateStr)return'—'; const mins=Math.round((Date.now()-new Date(dateStr))/60000); if(mins<2)return'adesso'; if(mins<60)return`${mins} min fa`; if(mins<1440)return`${Math.round(mins/60)} ore fa`; return`${Math.round(mins/1440)} giorni fa`; }
function fmtDate(dateStr) { if(!dateStr)return'—'; return new Date(dateStr).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}); }
function esc(str) { if(str===null||str===undefined)return''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function loadingHtml() { return '<div class="loading"><div class="spinner"></div> Caricamento...</div>'; }
function errorHtml()   { return '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Errore nel caricamento</div></div>'; }
function emptyHtml(title, sub) { return `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div></div>`; }

// ─── VISTA UTENTI (admin only) ────────────────────────────────────────────────
let _usersCache = [];

async function loadUsers() {
    if (currentProfile?.role !== 'admin') return;
    currentView = 'users'; showView('users'); setActiveNav('nav-users');
    setBreadcrumb([{label:'Utenti', active:true}]);
    setHero('Utenti', 'Gestione accessi');

    const el = document.getElementById('users-container');
    el.innerHTML = loadingHtml();

    const { data: users, error } = await _SB.from('mon_profiles').select('*').order('created_at', {ascending:false});
    if (error || !users) { el.innerHTML = errorHtml(); return; }
    _usersCache = users;
    renderUsers(users);
}

function renderUsers(users) {
    const el = document.getElementById('users-container');
    el.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title">${users.length} account registrati</span>
                <input type="text" id="user-search" class="search-input" placeholder="🔍 Cerca utente...">
            </div>
            <table class="sites-table">
                <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Registrato</th><th>Azioni</th></tr></thead>
                <tbody>${users.map(userRowHtml).join('')}</tbody>
            </table>
        </div>`;

    document.getElementById('user-search').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#users-container tbody tr').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', () => openEditUser(btn.dataset.id));
    });
    document.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.id, btn.dataset.name));
    });
}

function userRowHtml(u) {
    const initials = (u.full_name || u.email || '?').charAt(0).toUpperCase();
    const isSelf   = u.id === currentProfile?.id;
    const roleCls  = u.role === 'admin' ? 'role-badge-admin' : 'role-badge-user';
    const roleLabel = u.role === 'admin' ? 'Admin' : 'User';
    return `<tr>
        <td>
            <div style="display:flex;align-items:center;gap:10px">
                ${u.avatar_url
                    ? `<img src="${esc(u.avatar_url)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0">`
                    : `<div class="user-initial">${initials}</div>`}
                <strong>${esc(u.full_name||'—')}</strong>${isSelf?'<span class="user-self-tag">tu</span>':''}
            </div>
        </td>
        <td style="font-size:13px;color:var(--grey)">${esc(u.email)}</td>
        <td><span class="role-badge ${roleCls}">${roleLabel}</span></td>
        <td style="font-size:12px;color:var(--grey)">${fmtDate(u.created_at)}</td>
        <td style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <button class="btn-ping btn-edit-user" data-id="${esc(u.id)}">✏ Modifica</button>
            ${!isSelf?`<button class="btn-delete-user" data-id="${esc(u.id)}" data-name="${esc(u.full_name||u.email)}" style="background:none;border:none;color:var(--red-text);font-size:13px;font-weight:600;cursor:pointer;padding:6px 10px;border-radius:8px;transition:background .15s" onmouseover="this.style.background='var(--red-bg)'" onmouseout="this.style.background='none'">🗑 Elimina</button>`:''}
        </td>
    </tr>`;
}

function openEditUser(id) {
    const u = _usersCache.find(x => x.id === id);
    if (!u) return;
    document.getElementById('edit-user-id').value     = u.id;
    document.getElementById('edit-user-name').value   = u.full_name || '';
    document.getElementById('edit-user-role').value   = u.role;
    document.getElementById('edit-user-error').style.display = 'none';
    document.getElementById('edit-user-overlay').style.display = 'flex';

    const saveBtn = document.getElementById('btn-save-user');
    saveBtn.onclick = async () => {
        const name = document.getElementById('edit-user-name').value.trim();
        const role = document.getElementById('edit-user-role').value;
        saveBtn.textContent = '...'; saveBtn.disabled = true;
        const { error } = await _SB.from('mon_profiles').update({ full_name: name, role }).eq('id', u.id);
        saveBtn.textContent = 'Salva'; saveBtn.disabled = false;
        if (error) {
            const errEl = document.getElementById('edit-user-error');
            errEl.textContent = error.message; errEl.style.display = 'block';
        } else {
            document.getElementById('edit-user-overlay').style.display = 'none';
            loadUsers();
        }
    };

    document.getElementById('edit-user-close').onclick = () => {
        document.getElementById('edit-user-overlay').style.display = 'none';
    };
    document.getElementById('edit-user-overlay').onclick = e => {
        if (e.target === document.getElementById('edit-user-overlay'))
            document.getElementById('edit-user-overlay').style.display = 'none';
    };
}

async function deleteUser(id, name) {
    if (!confirm(`Eliminare l'utente "${name}"?\n\nL'accesso al monitoring verrà revocato.`)) return;
    const { error } = await _SB.from('mon_profiles').delete().eq('id', id);
    if (error) { alert('Errore: ' + error.message); return; }
    loadUsers();
}
