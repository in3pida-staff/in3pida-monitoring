// ─── STATE ────────────────────────────────────────────────────────────────────
let currentView   = 'plugins';
let currentPlugin = null;
let currentSite   = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    fetch('/auth/me').then(r => r.json()).then(d => {
        if (!d.authenticated) { window.location.href = '/login.html'; return; }
        loadProfile();
        loadPlugins();
        setInterval(refresh, 60000);
    });

    // Logo → home
    document.getElementById('nav-home').addEventListener('click', loadPlugins);

    // Nav items centro
    document.getElementById('nav-plugin').addEventListener('click', loadPlugins);
    document.getElementById('nav-errors').addEventListener('click', loadErrors);
    document.getElementById('nav-info').addEventListener('click', () => {
        document.getElementById('info-overlay').style.display = 'flex';
    });

    // Dropdown utente
    const pill     = document.getElementById('user-pill');
    const dropdown = document.getElementById('user-dropdown');
    pill.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { dropdown.style.display = 'none'; });
    dropdown.addEventListener('click', e => e.stopPropagation());

    document.getElementById('dd-logout').addEventListener('click', async () => {
        await fetch('/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
    });
    document.getElementById('dd-profile').addEventListener('click', () => {
        dropdown.style.display = 'none';
        openProfileModal();
    });

    // Modal legenda
    const infoOverlay = document.getElementById('info-overlay');
    document.getElementById('info-close').addEventListener('click', () => { infoOverlay.style.display = 'none'; });
    infoOverlay.addEventListener('click', (e) => { if (e.target === infoOverlay) infoOverlay.style.display = 'none'; });

    // Modal profilo
    const profileOverlay = document.getElementById('profile-overlay');
    document.getElementById('profile-close').addEventListener('click', () => { profileOverlay.style.display = 'none'; });
    profileOverlay.addEventListener('click', (e) => { if (e.target === profileOverlay) profileOverlay.style.display = 'none'; });
    document.getElementById('profile-avatar-input').addEventListener('change', uploadAvatar);
    document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
});

// ─── PROFILO ─────────────────────────────────────────────────────────────────
async function loadProfile() {
    try {
        const r = await fetch('/api/profile', { credentials: 'include' });
        if (!r.ok) return;
        const p = await r.json();
        applyProfile(p);
    } catch(e) {}
}

function applyProfile(p) {
    const name = p.name || 'Mario';
    document.getElementById('nav-name').textContent = name;
    document.getElementById('dd-name').textContent  = name;
    document.getElementById('dd-email').textContent = p.email || '';

    const avatarEl   = document.getElementById('nav-avatar');
    const ddAvatarEl = document.getElementById('dd-avatar');
    const previewEl  = document.getElementById('profile-avatar-preview');

    if (p.avatar) {
        const img1 = `<img src="${p.avatar}" alt="">`;
        avatarEl.innerHTML   = img1;
        ddAvatarEl.innerHTML = img1;
        previewEl.innerHTML  = img1;
    } else {
        const init = name.charAt(0).toUpperCase();
        avatarEl.textContent   = init;
        ddAvatarEl.textContent = init;
        previewEl.textContent  = init;
    }
}

function openProfileModal() {
    fetch('/api/profile', { credentials: 'include' }).then(r => r.json()).then(p => {
        document.getElementById('profile-name').value  = p.name  || '';
        document.getElementById('profile-email').value = p.email || '';
        applyProfile(p);
        document.getElementById('profile-overlay').style.display = 'flex';
    });
}

async function uploadAvatar(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    const r = await fetch('/api/profile/avatar', { method: 'POST', body: fd, credentials: 'include' });
    const j = await r.json();
    if (j.ok) loadProfile();
}

async function saveProfile() {
    const name  = document.getElementById('profile-name').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const r = await fetch('/api/profile', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email })
    });
    const j = await r.json();
    if (j.ok) {
        applyProfile(j.profile);
        document.getElementById('profile-overlay').style.display = 'none';
    }
}

// ─── ACTIVE NAV ──────────────────────────────────────────────────────────────
function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function refresh() {
    if      (currentView === 'plugins') loadPlugins(true);
    else if (currentView === 'sites'   && currentPlugin) loadSites(currentPlugin, true);
    else if (currentView === 'site'    && currentSite)   loadSiteDetail(currentSite, true);
    else if (currentView === 'errors')                   loadErrors(true);
}

// ─── VIEW: HOME / PLUGIN ──────────────────────────────────────────────────────
async function loadPlugins(silent = false) {
    currentView = 'plugins';
    showView('plugins');
    setActiveNav('nav-plugin');
    setBreadcrumb([{ label: 'Home', active: true }]);

    const el = document.getElementById('plugins-container');
    if (!silent) el.innerHTML = loadingHtml();

    const res = await fetch('/api/plugins');
    if (!res.ok) { el.innerHTML = errorHtml(); return; }
    const json = await res.json();
    const plugins = json.plugins || json;
    const dailySeries = json.daily_series || [];

    if (plugins.length === 0) {
        el.innerHTML = emptyHtml('Nessun plugin registrato', 'I plugin appariranno non appena i siti invieranno il primo segnale.');
        setHero('Monitoring', 'in3pida Monitoring', []);
        return;
    }

    const active = plugins.reduce((s, p) => s + (p.active || 0), 0);
    const errors = plugins.reduce((s, p) => s + (p.errors || 0), 0);

    setHero('Monitoring', 'in3pida Monitoring', [
        { num: plugins.length, label: 'Plugin monitorati' },
        { num: active,         label: 'Plugin attivi' },
        { num: errors,         label: 'Siti con errori', clickable: true, action: 'errors' },
    ]);

    el.innerHTML = `
        <p class="section-title">Plugin installati</p>
        <div class="plugins-grid">
            ${plugins.map(pluginCardHtml).join('')}
        </div>
        ${dailySeries.length > 0 ? `
        <div class="card" style="margin-top:24px">
            <div class="card-header">
                <span class="card-title">Andamento richieste</span>
                <div class="chart-toggle" id="global-toggle">
                    <button class="chart-toggle-btn active" data-range="7">7 giorni</button>
                    <button class="chart-toggle-btn" data-range="30">30 giorni</button>
                </div>
            </div>
            <div style="padding:20px 26px 24px">
                <canvas id="chart-global" height="80"></canvas>
            </div>
        </div>` : ''}
    `;

    el.querySelectorAll('.plugin-card').forEach(card => {
        card.addEventListener('click', () => loadSites(card.dataset.name));
    });

    // Rende cliccabile la stat card "Siti con errori"
    document.querySelectorAll('.sw-stat-card[data-action]').forEach(c => {
        c.style.cursor = 'pointer';
        c.addEventListener('click', () => loadErrors());
    });

    // Grafico globale
    if (dailySeries.length > 0 && document.getElementById('chart-global')) {
        const colors = ['#d82d6b', '#009bb9', '#181834'];
        let globalChart = null;

        function buildGlobalChart(range) {
            const labels = dailySeries[0].data.slice(-range).map(r =>
                new Date(r.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
            );
            const datasets = dailySeries.map((series, i) => {
                const color = colors[i % colors.length];
                return {
                    label: displayName(series.plugin),
                    data: series.data.slice(-range).map(r => r.count),
                    borderColor: color,
                    borderWidth: 2.5,
                    pointBackgroundColor: color,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    fill: i === 0,
                    backgroundColor: i === 0 ? (ctx) => {
                        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
                        g.addColorStop(0, 'rgba(216,45,107,0.15)');
                        g.addColorStop(1, 'rgba(216,45,107,0)');
                        return g;
                    } : 'transparent',
                    tension: 0.4,
                };
            });
            if (globalChart) globalChart.destroy();
            globalChart = new Chart(document.getElementById('chart-global'), {
                type: 'line',
                data: { labels, datasets },
                options: {
                    plugins: { legend: { display: dailySeries.length > 1, labels: { font: { family: 'Montserrat', size: 11 }, boxWidth: 12 } } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { family: 'Montserrat', size: 10 }, maxTicksLimit: 10, color: '#999' } },
                        y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Montserrat', size: 11 }, color: '#999' }, grid: { color: '#f4f4f8' } }
                    }
                }
            });
        }

        buildGlobalChart(7);
        document.querySelectorAll('#global-toggle .chart-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#global-toggle .chart-toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                buildGlobalChart(parseInt(btn.dataset.range));
            });
        });
    }
}

function pluginCardHtml(p) {
    const pills = Object.entries(p.versions || {})
        .map(([v, c]) => `<span class="version-pill">v${esc(v)}${c > 1 ? ' ×'+c : ''}</span>`)
        .join('') || '<span class="version-pill">—</span>';
    return `
        <div class="plugin-card ${esc(p.status)}" data-name="${esc(p.name)}">
            <div class="plugin-card-left">
                <div class="plugin-card-top">
                    ${dot(p.status, true)}
                    <div class="plugin-card-name">${esc(displayName(p.name))}</div>
                </div>
                <div class="plugin-card-versions">${pills}</div>
            </div>
            <div class="plugin-card-right">
                <div class="plugin-stat">
                    <div class="plugin-stat-num">${p.total}</div>
                    <div class="plugin-stat-label">Siti installati</div>
                </div>
                <div class="plugin-stat">
                    <div class="plugin-stat-num online">${p.active}</div>
                    <div class="plugin-stat-label">Plugin attivi</div>
                </div>
                <div class="plugin-stat">
                    <div class="plugin-stat-num offline">${p.inactive}</div>
                    <div class="plugin-stat-label">Nessun segnale</div>
                </div>
                <div class="plugin-card-arrow">›</div>
            </div>
        </div>`;
}

// ─── VIEW: SITI CON ERRORI ────────────────────────────────────────────────────
async function loadErrors(silent = false) {
    currentView = 'errors';
    showView('errors');
    setActiveNav('nav-errors');
    setBreadcrumb([
        { label: 'Home', onclick: loadPlugins },
        { label: 'Siti con errori', active: true }
    ]);
    setHero('Monitoring', 'Siti con errori', []);

    const el = document.getElementById('errors-container');
    if (!silent) el.innerHTML = loadingHtml();

    const res = await fetch('/api/errors');
    if (!res.ok) { el.innerHTML = errorHtml(); return; }
    const data = await res.json();

    if (data.length === 0) {
        el.innerHTML = `<button class="btn-back" id="back-err">← Torna alla home</button>` +
            emptyHtml('Nessun errore nelle ultime 24h', 'Tutto funziona correttamente.');
        document.getElementById('back-err').addEventListener('click', loadPlugins);
        return;
    }

    el.innerHTML = `
        <button class="btn-back" id="back-err">← Torna alla home</button>
        ${data.map(item => {
            const s = item.site;
            const errGroups = {};
            (item.errors || []).forEach(e => {
                const key = e.integration + ':' + (e.error_message || '');
                errGroups[key] = (errGroups[key] || 0) + 1;
            });
            return `
            <div class="card" style="margin-bottom:16px">
                <div class="card-header">
                    <div>
                        <span class="card-title">${esc(s?.site_name || s?.site_id)}</span>
                        <span style="font-size:12px;color:var(--grey);margin-left:10px">${esc(s?.site_url || '')}</span>
                    </div>
                    <button class="btn-detail" data-site="${esc(s?.site_id)}">Vedi dettaglio →</button>
                </div>
                <div style="padding:4px 0">
                ${Object.entries(errGroups).map(([key, count]) => {
                    const [integ, msg] = key.split(':');
                    const integLabel = { supabase: 'Salvataggio DB', crm: 'CRM', amelia: 'Amelia' }[integ] || integ;
                    return `<div class="log-item">
                        <span class="log-level error">errore</span>
                        <span class="log-message"><strong>${esc(integLabel)}</strong> — ${esc(msg || 'Errore sconosciuto')}</span>
                        <span class="log-time">${count}× nelle ultime 24h</span>
                    </div>`;
                }).join('')}
                </div>
            </div>`;
        }).join('')}
    `;

    document.getElementById('back-err').addEventListener('click', loadPlugins);
    el.querySelectorAll('.btn-detail').forEach(btn => {
        btn.addEventListener('click', () => loadSiteDetail(btn.dataset.site));
    });
}

// ─── VIEW: SITI ───────────────────────────────────────────────────────────────
async function loadSites(pluginName, silent = false) {
    currentPlugin = pluginName;
    currentView   = 'sites';
    showView('sites');
    setBreadcrumb([
        { label: 'Home', onclick: loadPlugins },
        { label: displayName(pluginName), active: true }
    ]);

    const el = document.getElementById('sites-container');
    if (!silent) el.innerHTML = loadingHtml();

    const res = await fetch(`/api/plugins/${encodeURIComponent(pluginName)}/sites`);
    if (!res.ok) { el.innerHTML = errorHtml(); return; }
    const sites = await res.json();

    const active   = sites.filter(s => s.status === 'green').length;
    const inactive = sites.filter(s => s.status !== 'green').length;

    setHero(displayName(pluginName), displayName(pluginName), [
        { num: sites.length, label: 'Siti installati' },
        { num: active,       label: 'Plugin attivi' },
        { num: inactive,     label: 'Senza segnale' }
    ]);

    if (sites.length === 0) {
        el.innerHTML = emptyHtml('Nessuna installazione', 'Le installazioni appariranno quando i siti invieranno il primo segnale.');
        return;
    }

    el.innerHTML = `
        <button class="btn-back" id="back-to-plugins">← Torna ai plugin</button>
        <div class="card">
            <div class="card-header">
                <span class="card-title">Installazioni — ${esc(displayName(pluginName))}</span>
                <span style="font-size:12px;color:var(--grey)">${sites.length} siti</span>
            </div>
            <table class="sites-table">
                <thead><tr>
                    <th>Stato</th><th>Sito</th><th>Ultima richiesta</th>
                    <th>Supabase / CRM / Amelia</th><th>Ver.</th><th>Installato il</th><th></th>
                </tr></thead>
                <tbody>${sites.map(siteRowHtml).join('')}</tbody>
            </table>
        </div>`;

    document.getElementById('back-to-plugins').addEventListener('click', loadPlugins);
    el.querySelectorAll('tr[data-site-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.btn-ping')) return;
            loadSiteDetail(row.dataset.siteId);
        });
    });
    el.querySelectorAll('.btn-ping').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const siteId = btn.dataset.site;
            const name   = btn.dataset.name;
            btn.textContent = '...';
            btn.disabled = true;
            try {
                const res = await fetch(`/api/ping/${encodeURIComponent(siteId)}`);
                const d   = await res.json();
                showPingResult(name, d);
            } catch { showPingResult(name, null); }
            finally { btn.textContent = 'Testa ora'; btn.disabled = false; }
        });
    });
}

function siteRowHtml(s) {
    const integ = s.last_integ || {};
    const dotFor = (key) => {
        const st = integ[key];
        if (st === undefined || st === null || st === 'disabled') {
            return `<span class="integ-dot grey" title="${key}: non configurato"></span>`;
        }
        if (st === 'ok')      return `<span class="integ-dot dot-ok"      title="${key}: ok — dati salvati"></span>`;
        if (st === 'error')   return `<span class="integ-dot dot-error"   title="${key}: errore"></span>`;
        if (st === 'info')    return `<span class="integ-dot dot-info"    title="${key}: già presente"></span>`;
        if (st === 'skipped') return `<span class="integ-dot dot-skipped" title="${key}: saltato"></span>`;
        return `<span class="integ-dot dot-pending" title="${key}: ${st}"></span>`;
    };
    const crmBadge = s.has_crm ? '' : `<span class="no-crm-badge">CRM non collegato</span>`;
    return `
        <tr data-site-id="${esc(s.site_id)}">
            <td>${dot(s.status)}</td>
            <td>
                <div class="site-name-cell">${esc(s.site_name || s.site_url || s.site_id)}</div>
                <div class="site-url-cell">${esc(s.site_url || '')} ${crmBadge}</div>
            </td>
            <td style="font-size:12px;color:var(--grey)">${s.last_request ? timeAgo(s.last_request) : '—'}</td>
            <td>
                <div class="integ-dots-row">
                    <span class="integ-dots-label">Supabase</span>${dotFor('supabase')}
                    <span class="integ-dots-label">CRM</span>${dotFor('crm')}
                    <span class="integ-dots-label">Amelia</span>${dotFor('amelia')}
                </div>
            </td>
            <td style="font-size:12px;color:var(--grey)">${esc(s.plugin_version || '—')}</td>
            <td style="font-size:12px;color:var(--grey)">${fmtDate(s.first_seen)}</td>
            <td>
                <button class="btn-ping" data-site="${esc(s.site_id)}" data-name="${esc(s.site_name || s.site_id)}">
                    Testa ora
                </button>
            </td>
        </tr>`;
}

// ─── VIEW: DETTAGLIO SITO ─────────────────────────────────────────────────────
async function loadSiteDetail(siteId, silent = false) {
    currentSite = siteId;
    currentView = 'site';
    showView('site');

    const el = document.getElementById('site-container');
    if (!silent) el.innerHTML = loadingHtml();

    const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}`);
    if (!res.ok) { el.innerHTML = errorHtml(); return; }
    const d = await res.json();

    const siteName   = d.site.site_name || d.site.site_url || siteId;
    const pluginName = d.site.plugin_name;

    setBreadcrumb([
        { label: 'Home',                  onclick: loadPlugins },
        { label: displayName(pluginName), onclick: () => loadSites(pluginName) },
        { label: siteName,                active: true }
    ]);
    setHero(displayName(pluginName), siteName, [
        { num: d.total_submissions, label: 'Richieste totali' },
        { num: d.events_week,       label: 'Ultimi 7 giorni' }
    ]);

    const integLabels = { supabase: 'Supabase (salvataggio dati)', crm: 'CRM (invio contatto)', amelia: 'Amelia (prenotazione)' };

    const suggestionsHtml = (d.suggestions || []).length > 0 ? `
        <div class="card">
            <div class="card-header"><span class="card-title">Cosa fare</span></div>
            ${d.suggestions.map(s => `
            <div class="suggestion-item ${esc(s.level)}">
                <div class="suggestion-title">${esc(s.title)}</div>
                <div class="suggestion-action">${esc(s.action)}</div>
            </div>`).join('')}
        </div>` : '';

    const versionHtml = d.version ? `
        <div class="version-row">
            <span>Versione installata: <strong>${esc(d.version.installed)}</strong></span>
            ${d.version.ok
                ? `<span class="version-badge ok">Aggiornato</span>`
                : `<span class="version-badge warn">Aggiornamento disponibile: v${esc(d.version.latest)}</span>`}
        </div>` : '';

    el.innerHTML = `
        <button class="btn-back" id="back-to-sites">← Torna ai siti — ${esc(displayName(pluginName))}</button>

        ${suggestionsHtml}

        <div class="detail-grid">
            <div class="card">
                <div class="card-header"><span class="card-title">Stato semafori</span></div>
                <div class="semaforo-general">
                    ${dot(d.overall_status, true)}
                    <span>Stato generale: <strong>${statusLabel(d.overall_status)}</strong></span>
                </div>
                <div class="semaforo-row">
                    ${dot(d.heartbeat.status)}
                    <span class="semaforo-label">Plugin attivo sul sito <span style="font-weight:400;color:var(--grey);font-size:11px">(verifica automatica ogni ora)</span></span>
                    <span class="semaforo-detail">Ultima verifica: ${timeAgo(d.heartbeat.last_heartbeat)}</span>
                </div>
                ${Object.entries(d.integrations).map(([key, v]) => `
                <div class="semaforo-row">
                    ${dot(v.status)}
                    <span class="semaforo-label">${integLabels[key] || key}</span>
                    <span class="semaforo-detail">${v.total > 0
                        ? `${v.ok}/${v.total} ok (${v.rate}%)${v.last_error ? ' — ' + v.last_error.substring(0,40) : ''}`
                        : 'Nessun dato nelle ultime 24h'}</span>
                </div>`).join('')}
            </div>

            <div class="card">
                <div class="card-header"><span class="card-title">Informazioni sito</span></div>
                ${versionHtml ? `<div style="padding:12px 26px 0">${versionHtml}</div>` : ''}
                <div class="info-grid">
                    ${infoRow('Sito',          d.site.site_name)}
                    ${infoRow('URL',           d.site.site_url)}
                    ${infoRow('Plugin ver.',   d.site.plugin_version)}
                    ${infoRow('WordPress',     d.site.wp_version)}
                    ${infoRow('PHP',           d.site.php_version)}
                    ${infoRow('Tema attivo',   d.site.theme_active)}
                    ${infoRow('Installato il', fmtDate(d.site.first_seen))}
                    ${infoRow('Site ID',       d.site.site_id, true)}
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <span class="card-title">Richieste ricevute giorno per giorno</span>
                <div class="chart-toggle" id="sub-toggle">
                    <button class="chart-toggle-btn active" data-range="7">7 giorni</button>
                    <button class="chart-toggle-btn" data-range="30">30 giorni</button>
                </div>
            </div>
            <div style="padding:20px 26px 24px">
                <canvas id="chart-submissions" height="80"></canvas>
            </div>
        </div>

        ${(()=>{
            const integRows = ['supabase','crm','amelia'].map(integ => {
                const trend = (d.integration_trends || []).find(t => t.integration === integ);
                if (!trend) return null;
                return { integ, label: {supabase:'Salvataggio DB',crm:'CRM',amelia:'Amelia'}[integ], data: trend.data.slice(-14) };
            }).filter(Boolean);
            const hasAnyData = integRows.some(r => r.data.some(x => x.rate !== null));
            if (!hasAnyData) return '';
            const dateLabels = integRows[0].data.map(r =>
                new Date(r.date).toLocaleDateString('it-IT',{day:'2-digit',month:'short'})
            );
            return `<div class="card">
                <div class="card-header"><span class="card-title">Funzionamento integrazioni — ultimi 14 giorni</span></div>
                <div style="padding:16px 26px 20px;overflow-x:auto">
                    <table class="heatmap-table">
                        <thead><tr>
                            <th></th>
                            ${dateLabels.map(l=>`<th>${l}</th>`).join('')}
                        </tr></thead>
                        <tbody>
                        ${integRows.map(row=>`<tr>
                            <td class="heatmap-row-label">${row.label}</td>
                            ${row.data.map(r=>{
                                if (r.rate===null) return `<td><span class="heatmap-cell empty" title="Nessun dato">—</span></td>`;
                                const cls = r.rate===100?'ok':r.rate>=80?'warn':'err';
                                return `<td><span class="heatmap-cell ${cls}" title="${r.date}: ${r.rate}%">${r.rate}%</span></td>`;
                            }).join('')}
                        </tr>`).join('')}
                        </tbody>
                    </table>
                    <div class="heatmap-legend" style="margin-top:14px">
                        <span class="heatmap-cell ok" style="padding:2px 8px">100%</span> Tutto ok
                        <span class="heatmap-cell warn" style="margin-left:14px;padding:2px 8px">80%+</span> Qualche errore
                        <span class="heatmap-cell err" style="margin-left:14px;padding:2px 8px">&lt;80%</span> Molti errori
                    </div>
                </div>
            </div>`;
        })()}

        <div class="stat-cards-row">
            <div class="stat-big-card magenta">
                <div class="stat-big-num">${d.total_submissions}</div>
                <div class="stat-big-label">Richieste ricevute in totale</div>
            </div>
            <div class="stat-big-card cyan">
                <div class="stat-big-num">${d.events_week}</div>
                <div class="stat-big-label">Richieste negli ultimi 7 giorni</div>
            </div>
            <div class="stat-big-card">
                <div class="stat-big-num">${rateLabel(d.integrations.supabase)}</div>
                <div class="stat-big-label">Salvataggio DB (ultime 24h)</div>
            </div>
            <div class="stat-big-card">
                <div class="stat-big-num">${rateLabel(d.integrations.crm)}</div>
                <div class="stat-big-label">Invio CRM (ultime 24h)</div>
            </div>
            <div class="stat-big-card">
                <div class="stat-big-num">${rateLabel(d.integrations.amelia)}</div>
                <div class="stat-big-label">Amelia (ultime 24h)</div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <span class="card-title">Log recenti</span>
                <span style="font-size:12px;color:var(--grey)">Ultimi 20</span>
            </div>
            ${d.logs.length > 0
                ? '<div>' + d.logs.map(logRowHtml).join('') + '</div>'
                : emptyHtml('Nessun log', 'Nessun errore registrato.')}
        </div>`;

    document.getElementById('back-to-sites').addEventListener('click', () => loadSites(pluginName));

    // Grafico richieste
    if (d.daily_submissions?.length > 0) {
        buildLineChart('chart-submissions', 'sub-toggle', [{ color: '#d82d6b', data: d.daily_submissions, fill: true }], 7);
    }

    // Grafico integrazioni
    if (d.integration_trends?.length > 0) {
        const integColors = { supabase: '#d82d6b', crm: '#009bb9', amelia: '#181834' };
        const integSeries = d.integration_trends.map(t => ({
            label: integLabels[t.integration] || t.integration,
            color: integColors[t.integration] || '#999',
            data: t.data.map(r => ({ date: r.date, count: r.rate })),
            fill: false
        }));
        buildLineChart('chart-integrations', 'integ-toggle', integSeries, 7, '%');
    }
}

// ─── PING MODAL ───────────────────────────────────────────────────────────────
function showPingResult(name, d) {
    document.getElementById('ping-modal')?.remove();
    const integLabels = { supabase: 'Salvataggio DB', crm: 'Invio CRM', amelia: 'Amelia' };
    const rows = d ? Object.entries(d.integ_counts || {}).map(([k, v]) => {
        const rate = v.total > 0 ? Math.round(v.ok / v.total * 100) : null;
        const cls  = rate === null ? 'grey' : rate === 100 ? 'green' : rate >= 80 ? 'yellow' : 'red';
        return `<div class="ping-row">
            ${dot(cls)}
            <span>${integLabels[k] || k}</span>
            <span style="margin-left:auto;font-weight:700">${rate !== null ? rate + '%' : '—'}</span>
            <span style="font-size:11px;color:var(--grey)">${v.ok}/${v.total} ok nelle ultime 24h</span>
        </div>`;
    }).join('') : '';

    const modal = document.createElement('div');
    modal.id = 'ping-modal';
    modal.className = 'ping-overlay';
    modal.innerHTML = `
        <div class="ping-card">
            <div class="ping-header">
                <span class="ping-title">${esc(name)}</span>
                <button class="ping-close" id="ping-close">✕</button>
            </div>
            ${!d ? `<div style="padding:20px;color:var(--grey)">Errore nel recupero dati.</div>` : `
            <div class="ping-row" style="border-bottom:1px solid #f4f4f8;padding-bottom:12px;margin-bottom:4px">
                ${dot(d.plugin_active ? 'green' : 'red')}
                <span>Plugin ${d.plugin_active ? 'attivo' : 'non risponde'}</span>
                <span style="margin-left:auto;font-size:12px;color:var(--grey)">
                    Ultimo segnale: ${d.last_heartbeat ? timeAgo(d.last_heartbeat) : '—'}
                </span>
            </div>
            <div class="ping-row" style="margin-bottom:12px">
                <span style="font-size:12px;color:var(--grey)">Ultima richiesta ricevuta:</span>
                <span style="margin-left:auto;font-weight:700;font-size:13px">${d.last_request ? timeAgo(d.last_request) : 'Mai'}</span>
            </div>
            ${rows}
            <div style="font-size:11px;color:#bbb;padding-top:12px;text-align:right">
                Verificato ${timeAgo(d.checked_at)}
            </div>`}
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('ping-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ─── GRAFICO LINEE (riusabile) ────────────────────────────────────────────────
function buildLineChart(canvasId, toggleId, series, defaultRange, unit = '') {
    let chart = null;
    function build(range) {
        const labels = series[0].data.slice(-range).map(r =>
            new Date(r.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
        );
        const datasets = series.map(s => ({
            label: s.label || '',
            data: s.data.slice(-range).map(r => r.count),
            borderColor: s.color,
            borderWidth: 2.5,
            pointBackgroundColor: s.color,
            pointRadius: 3,
            pointHoverRadius: 6,
            fill: s.fill || false,
            backgroundColor: s.fill ? (ctx) => {
                const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
                g.addColorStop(0, s.color + '28');
                g.addColorStop(1, s.color + '00');
                return g;
            } : 'transparent',
            tension: 0.4,
            spanGaps: true,
        }));
        if (chart) chart.destroy();
        chart = new Chart(document.getElementById(canvasId), {
            type: 'line',
            data: { labels, datasets },
            options: {
                plugins: {
                    legend: { display: series.length > 1, labels: { font: { family: 'Montserrat', size: 11 }, boxWidth: 12 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}${unit}` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Montserrat', size: 10 }, maxTicksLimit: 10, color: '#999' } },
                    y: { beginAtZero: true, ticks: { font: { family: 'Montserrat', size: 11 }, color: '#999', callback: v => v + unit }, grid: { color: '#f4f4f8' } }
                }
            }
        });
    }
    build(defaultRange);
    document.querySelectorAll(`#${toggleId} .chart-toggle-btn`).forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll(`#${toggleId} .chart-toggle-btn`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            build(parseInt(btn.dataset.range));
        });
    });
}

// ─── LOG ROW ──────────────────────────────────────────────────────────────────
function logRowHtml(log) {
    return `<div class="log-item">
        <span class="log-level ${esc(log.level)}">${esc(log.level)}</span>
        <span class="log-message">${esc(log.message)}</span>
        <span class="log-time">${timeAgo(log.created_at)}</span>
    </div>`;
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function showView(view) {
    ['plugins', 'sites', 'site', 'errors'].forEach(v =>
        document.getElementById(`view-${v}`).style.display = v === view ? '' : 'none'
    );
}

function setHero(label, title, stats) {
    document.getElementById('hero-label').textContent = label;
    document.getElementById('hero-title').textContent = title;
    const el = document.getElementById('sw-stats');
    if (stats && stats.length > 0) {
        el.style.display = '';
        const colors = ['var(--magenta)', 'var(--cyan)', 'var(--dark)'];
        el.innerHTML = stats.map((s, i) => `
            <div class="sw-stat-card" ${s.clickable ? `data-action="${esc(s.action)}"` : ''}>
                <div class="sw-stat-icon" style="background:${colors[i % colors.length]}">${s.num}</div>
                <div class="sw-stat-text">
                    <div class="sw-stat-num">${s.num}</div>
                    <div class="sw-stat-label">${s.label}</div>
                </div>
            </div>`).join('');
    } else {
        el.style.display = 'none';
    }
}

function setBreadcrumb(items) {
    const el = document.getElementById('breadcrumb');
    el.innerHTML = items.map((item, i) => {
        const sep = i > 0 ? '<span class="breadcrumb-sep">›</span>' : '';
        const cls = item.active ? 'breadcrumb-item active' : 'breadcrumb-item';
        return `${sep}<span class="${cls}" data-i="${i}">${esc(item.label)}</span>`;
    }).join('');
    items.forEach((item, i) => {
        if (item.onclick) {
            const node = el.querySelector(`[data-i="${i}"]`);
            if (node) node.addEventListener('click', item.onclick);
        }
    });
}

function infoRow(label, value, small = false) {
    const style = small ? ' style="font-size:11px;color:var(--grey)"' : '';
    return `<div class="info-row">
        <div class="info-label">${esc(label)}</div>
        <div class="info-value"${style}>${esc(value || '—')}</div>
    </div>`;
}

function rateLabel(integ) {
    if (!integ || integ.total === 0) return '—';
    return integ.rate + '%';
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────
function displayName(name) {
    const map = { 'in3pida-form-2': 'in3pida Form 2.0', 'smart-working': 'Smart Working', 'llm-positioning': 'Plugin LLM' };
    return map[name] || name;
}

function dot(status, lg = false) {
    return `<span class="dot${lg ? ' lg' : ''} ${esc(status)}"></span>`;
}

function statusLabel(s) {
    return { green: 'Tutto OK', yellow: 'Attenzione', red: 'Errore', grey: 'N/D' }[s] || s;
}

function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const mins = Math.round((Date.now() - new Date(dateStr)) / 60000);
    if (mins < 2)    return 'adesso';
    if (mins < 60)   return `${mins} min fa`;
    if (mins < 1440) return `${Math.round(mins / 60)} ore fa`;
    return `${Math.round(mins / 1440)} giorni fa`;
}

function fmtDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function loadingHtml() {
    return '<div class="loading"><div class="spinner"></div> Caricamento...</div>';
}

function errorHtml() {
    return '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Errore nel caricamento</div></div>';
}

function emptyHtml(title, sub) {
    return `<div class="empty-state">
        <div class="empty-icon">📊</div>
        <div class="empty-title">${title}</div>
        <div class="empty-sub">${sub}</div>
    </div>`;
}
