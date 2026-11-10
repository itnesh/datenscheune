// Datenscheune - Zeiterfassung, Projekte, Rechnungen. Daten lokal oder in Firestore (datenscheune/main/...).
const VERSION = '0.1.0';

/* ---------- Helfer ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pd = s => new Date(s + 'T00:00:00');
const today = () => iso(new Date());
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + Number(n || 0)); return iso(d); };
const fmt = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = v => { const n = parseFloat(String(v ?? '').replace(/'/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const r05 = n => Math.round(n * 20) / 20;
const r01 = n => Math.round(n * 100) / 100;
const tsd = (n, sep = "'") => { const [a, b] = (Math.round((n || 0) * 100) / 100).toFixed(2).split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g, sep) + '.' + b; };
const chf = n => tsd(n);
const hm = m => { m = Math.round(m || 0); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const hdec = m => (Math.round((m || 0) / 60 * 100) / 100).toFixed(2);
const clean = o => JSON.parse(JSON.stringify(o));
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monTxt = ym => `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const wochenStart = (d = today()) => { const x = pd(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return iso(x); };
// Dauer: "1:30" = 90 Min, "1.5" / "1,5" = 1.5 Std, "45m" = 45 Min
function parseDauer(v) {
  const s = String(v || '').trim().toLowerCase(); if (!s) return 0;
  let m = s.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*m(in)?$/); if (m) return Math.round(num(m[1]));
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*h?$/); if (m) return Math.round(num(m[1]) * 60);
  return 0;
}

/* ---------- Daten ---------- */
const DEF = {
  firma: 'Datenscheune', name: 'Matthias Erdin', strasse: '', nr: '', plz: '', ort: '', land: 'CH', email: '', tel: '', web: '',
  iban: '', logo: '', frist: 30, fusstext: 'Nicht mehrwertsteuerpflichtig.\nVielen Dank für den Auftrag.', mwstGrenze: 100000, rundung: 0, timer: null
};
const COLLS = ['firmen', 'projekte', 'logs', 'spesen', 'rechnungen'];
const S = { loaded: {}, set: { ...DEF } }; COLLS.forEach(c => S[c] = []);
const ROOT = ['datenscheune', 'main'];
let W = null, mode = 'local', USER = null, AUTH = null;
const STATUS = ['Idee', 'Offeriert', 'Aktiv', 'Pausiert', 'Abgeschlossen'];
const STC = { Idee: '', Offeriert: 'blue', Aktiv: 'green', Pausiert: 'warn', Abgeschlossen: '' };

function setSync(st, title) { const el = $('#sync'); if (el) { el.className = 'sync ' + st; el.title = title || ''; } }
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function showErr(e) { console.error(e); setSync('err', String(e && e.message || e)); toast(e && e.code === 'permission-denied' ? 'Zugriff verweigert - Konto nicht freigegeben' : 'Fehler: ' + (e && (e.code || e.message) || e)); }

function initLocal() {
  mode = 'local';
  try { const d = JSON.parse(localStorage.getItem('ds-local') || '{}'); COLLS.forEach(c => S[c] = d[c] || []); S.set = { ...DEF, ...(d.set || {}) }; } catch (e) { }
  COLLS.forEach(c => S.loaded[c] = true);
  const persist = () => { const d = { set: S.set }; COLLS.forEach(c => d[c] = S[c]); localStorage.setItem('ds-local', JSON.stringify(d)); schedule(); };
  W = {
    put: (c, o) => { const i = S[c].findIndex(x => x.id === o.id); if (i >= 0) S[c][i] = o; else S[c].push(o); persist(); },
    del: (c, id) => { S[c] = S[c].filter(x => x.id !== id); persist(); },
    setSettings: o => { S.set = { ...DEF, ...o }; persist(); }
  };
  setSync('off', 'Nur lokal in diesem Browser gespeichert (Firebase nicht eingerichtet)');
  start();
}

async function initFirebase(cfg) {
  mode = 'firebase'; setSync('', 'Verbinde...');
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const A = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app); AUTH = { auth, A };
  try { await A.getRedirectResult(auth); } catch (e) { loginScreen(e.message); }
  USER = await new Promise(res => A.onAuthStateChanged(auth, u => u ? res(u) : loginScreen()));
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { db = F.getFirestore(app); }
  COLLS.forEach(c => F.onSnapshot(F.collection(db, ...ROOT, c), { includeMetadataChanges: true }, snap => {
    S[c] = snap.docs.map(d => ({ ...d.data(), id: d.id })); S.loaded[c] = true;
    setSync(snap.metadata.fromCache ? 'off' : 'ok', snap.metadata.fromCache ? 'Offline - wird später synchronisiert' : 'Synchronisiert (' + USER.email + ')');
    schedule();
  }, showErr));
  F.onSnapshot(F.doc(db, ...ROOT, 'einstellungen', 'main'), d => { S.set = { ...DEF, ...(d.data() || {}) }; S.loaded.set = true; schedule(); }, showErr);
  W = {
    put: (c, o) => { F.setDoc(F.doc(db, ...ROOT, c, o.id), clean(o)).catch(showErr); },
    del: (c, id) => { F.deleteDoc(F.doc(db, ...ROOT, c, id)).catch(showErr); },
    setSettings: o => { F.setDoc(F.doc(db, ...ROOT, 'einstellungen', 'main'), clean(o)).catch(showErr); }
  };
  start();
}

function loginScreen(msg) {
  $('#app').classList.add('hidden');
  const el = $('#login'); el.classList.remove('hidden');
  el.innerHTML = `<div class="card"><img src="icons/icon-192.png" width="72" height="72" alt=""><h1>Datenscheune</h1><p class="muted">Zeiterfassung, Projekte und Rechnungen</p>
    ${msg ? `<div class="note" style="margin:10px 0">${esc(msg)}</div>` : ''}
    <button class="btn pri" id="glogin" style="width:100%;justify-content:center;margin-top:10px">Mit Google anmelden</button></div>`;
  $('#glogin').onclick = async () => {
    const { A, auth } = AUTH; const p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
    try { await A.signInWithPopup(auth, p); }
    catch (e) { if (e.code === 'auth/popup-blocked') A.signInWithRedirect(auth, p); else loginScreen(e.message); }
  };
}

function start() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  schedule(); setInterval(tickTimer, 1000);
}

function put(c, o) { o.id = o.id || uid(); o.geaendert = Date.now(); W.put(c, o); return o; }
function del(c, id) { W.del(c, id); }
function saveSet(patch) { W.setSettings({ ...S.set, ...patch }); }

/* ---------- Fachlogik ---------- */
const firma = id => S.firmen.find(f => f.id === id);
const projekt = id => S.projekte.find(p => p.id === id);
const pFirma = p => p && firma(p.firmaId);
const ansatz = p => { if (!p) return 0; const a = num(p.ansatz); return a > 0 ? a : num((pFirma(p) || {}).ansatz); };
const pName = id => { const p = projekt(id); return p ? p.name : '(ohne Projekt)'; };
const fName = id => { const f = firma(id); return f ? f.name : '?'; };
const logFirma = l => { const p = projekt(l.projektId); return p ? p.firmaId : ''; };
const logWert = l => l.verrechenbar === false ? 0 : r01(l.minuten / 60 * ansatz(projekt(l.projektId)));
const sortFirmen = () => [...S.firmen].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
const allTags = () => { const c = {}; S.logs.forEach(l => (l.tags || []).forEach(t => c[t] = (c[t] || 0) + 1)); return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b, 'de')); };
const offeneLogs = fid => S.logs.filter(l => !l.rechnungId && l.verrechenbar !== false && (!fid || logFirma(l) === fid));
const offeneSpesen = fid => S.spesen.filter(s => !s.rechnungId && s.verrechenbar !== false && (!fid || (projekt(s.projektId) || {}).firmaId === fid));
const sumMin = ls => ls.reduce((a, l) => a + (l.minuten || 0), 0);
const umsatzJahr = y => S.rechnungen.filter(r => r.status !== 'storniert' && (r.datum || '').startsWith(y)).reduce((a, r) => a + num(r.total), 0);
function projektOptions(sel, nurAktiv = true) {
  return `<option value="">- Projekt wählen -</option>` + sortFirmen().map(f => {
    const ps = S.projekte.filter(p => p.firmaId === f.id && (!nurAktiv || p.status !== 'Abgeschlossen' || p.id === sel)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return ps.length ? `<optgroup label="${esc(f.name)}">${ps.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}
const firmaOptions = (sel, leer = '- Firma wählen -') => `<option value="">${leer}</option>` + sortFirmen().filter(f => !f.archiv || f.id === sel).map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
const adrZeilen = o => [o.strasse ? `${o.strasse}${o.nr ? ' ' + o.nr : ''}` : '', [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean);

/* ---------- Router ---------- */
let rq = false;
function schedule() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); }
const UI = { logMonat: today().slice(0, 7), logFirma: '', logProjekt: '', logTag: '', logStatus: '', qa: { datum: today(), projektId: '', text: '', dauer: '', tags: '[]', verrechenbar: true }, pStatus: 'offen', rStatus: '', spJahr: String(new Date().getFullYear()) };

function render() {
  if (mode === 'firebase' && !USER) return;
  const ae = document.activeElement;
  if (ae && $('#view').contains(ae) && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && /^(text|number|email|tel|url|date)$/.test(ae.type)))) { ae.addEventListener('blur', schedule, { once: true }); return; }
  const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [tab, id] = h.split('/');
  const V = { dashboard: vDashboard, logs: vLogs, projekte: vProjekte, projekt: vProjekt, firmen: vFirmen, firma: vFirma, spesen: vSpesen, rechnungen: vRechnungen, einstellungen: vEinstellungen }[tab] || vDashboard;
  const navTab = { projekt: 'projekte', firma: 'firmen' }[tab] || tab;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === navTab));
  $('#view').innerHTML = V(id);
  renderTimer();
}
window.addEventListener('hashchange', schedule);

/* ---------- Timer ---------- */
function renderTimer() {
  const t = S.set.timer, el = $('#timerbox');
  el.innerHTML = t ? `<div class="t" id="timerTxt">${timerTxt()}</div><div class="p">${esc(t.projektId ? pName(t.projektId) : 'Kein Projekt')}</div><button class="btn lime" data-act="timerStop">Stopp &amp; erfassen</button>`
    : `<div class="p" style="margin-top:0">Timer</div><button class="btn" data-act="timerStart">Start</button>`;
}
function timerTxt() { const t = S.set.timer; if (!t) return ''; const s = Math.max(0, Math.floor((Date.now() - t.start) / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function tickTimer() { const el = $('#timerTxt'); if (el) el.textContent = timerTxt(); }
function timerStart(projektId = '') { saveSet({ timer: { start: Date.now(), projektId: projektId || UI.qa.projektId || '' } }); toast('Timer gestartet'); }
function timerStop() {
  const t = S.set.timer; if (!t) return;
  let min = Math.max(1, Math.round((Date.now() - t.start) / 60000)); const r = num(S.set.rundung); if (r > 0) min = Math.ceil(min / r) * r;
  logModal({ datum: iso(new Date(t.start)), projektId: t.projektId, minuten: min, verrechenbar: true, tags: [] }, () => saveSet({ timer: null }));
}

/* ---------- Tag-Eingabe ---------- */
function tagInput(name, sel = [], qa = false) {
  return `<div class="tagin" data-tagin><input type="hidden" name="${name}" value='${esc(JSON.stringify(sel))}' ${qa ? `data-qa="${name}"` : ''}>${tagInner(sel, '')}</div>`;
}
function tagInner(sel, q) {
  const sugg = allTags().filter(t => !sel.includes(t) && (!q || t.toLowerCase().includes(q.toLowerCase()))).slice(0, 12);
  return `${sel.map(t => `<span class="tag">${esc(t)}<button type="button" data-tagdel="${esc(t)}" aria-label="entfernen">×</button></span>`).join('')}<input class="tagtxt" type="text" placeholder="${sel.length ? '' : 'Tag eingeben, Enter'}" value="${esc(q)}"><div class="sugg">${sugg.map(t => `<button type="button" class="tag" data-tagadd="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
}
function tagSet(box, fn) {
  const h = $('input[type=hidden]', box); let sel = []; try { sel = JSON.parse(h.value || '[]'); } catch (e) { }
  sel = fn(sel); h.value = JSON.stringify(sel); h.dispatchEvent(new Event('input', { bubbles: true }));
  [...box.children].forEach(c => { if (c !== h) c.remove(); });
  box.insertAdjacentHTML('beforeend', tagInner(sel, '')); $('.tagtxt', box).focus();
}
document.addEventListener('keydown', e => {
  const t = e.target; if (!t.classList || !t.classList.contains('tagtxt')) return;
  const box = t.closest('[data-tagin]');
  if ((e.key === 'Enter' || e.key === ',') && t.value.trim()) { e.preventDefault(); const v = t.value.trim().replace(/,$/, ''); tagSet(box, s => s.includes(v) ? s : [...s, v]); }
  else if (e.key === 'Enter') e.preventDefault();
  else if (e.key === 'Backspace' && !t.value) { e.preventDefault(); tagSet(box, s => s.slice(0, -1)); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.classList && t.classList.contains('tagtxt')) { const box = t.closest('[data-tagin]'); let sel = []; try { sel = JSON.parse($('input[type=hidden]', box).value); } catch (x) { } const s = $('.sugg', box); s.outerHTML = tagInner(sel, t.value).match(/<div class="sugg">[\s\S]*<\/div>$/)[0]; }
  if (t.dataset && t.dataset.qa) UI.qa[t.dataset.qa] = t.type === 'checkbox' ? t.checked : t.value;
  if (t.dataset && t.dataset.ui) { UI[t.dataset.ui] = t.value; if (t.tagName === 'SELECT' || t.type === 'month') schedule(); }
});
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.ui) { UI[t.dataset.ui] = t.value; schedule(); } if (t.dataset && t.dataset.qa && t.type === 'checkbox') UI.qa[t.dataset.qa] = t.checked; });
// Tags beim Verlassen übernehmen (falls nicht mit Enter bestätigt)
document.addEventListener('focusout', e => { const t = e.target; if (t.classList && t.classList.contains('tagtxt') && t.value.trim()) { const box = t.closest('[data-tagin]'); const v = t.value.trim(); setTimeout(() => { if (!box.contains(document.activeElement)) { const h = $('input[type=hidden]', box); let s = JSON.parse(h.value || '[]'); if (!s.includes(v)) s.push(v); h.value = JSON.stringify(s); h.dispatchEvent(new Event('input', { bubbles: true })); t.value = ''; } }, 120); } });

/* ---------- Modal ---------- */
function modal({ title, body, onSave, onDelete, wide, saveTxt = 'Speichern', extra = '' }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate><header><h2>${esc(title)}</h2><button type="button" class="btn ghost" data-x>✕</button></header><div class="body">${body}</div><footer>${onDelete ? '<button type="button" class="btn danger" data-del>Löschen</button>' : ''}${extra}<span class="sp"></span><button type="button" class="btn" data-x>Abbrechen</button>${onSave ? `<button class="btn pri" type="submit">${esc(saveTxt)}</button>` : ''}</footer></form>`;
  $('#modals').appendChild(ov);
  const form = $('form', ov), close = () => ov.remove();
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  $$('[data-x]', ov).forEach(b => b.onclick = close);
  if (onDelete) $('[data-del]', ov).onclick = () => { if (confirm('Wirklich löschen?')) { onDelete(); close(); } };
  form.onsubmit = e => {
    e.preventDefault();
    // offenen Tag-Text übernehmen
    $$('[data-tagin]', form).forEach(box => { const t = $('.tagtxt', box); if (t.value.trim()) { const h = $('input[type=hidden]', box); const s = JSON.parse(h.value || '[]'); if (!s.includes(t.value.trim())) s.push(t.value.trim()); h.value = JSON.stringify(s); } });
    const fd = new FormData(form), o = {};
    for (const [k, v] of fd.entries()) { if (k.endsWith('[]')) (o[k.slice(0, -2)] = o[k.slice(0, -2)] || []).push(v); else o[k] = typeof v === 'string' ? v.trim() : v; }
    $$('input[type=checkbox][name]:not([name$="[]"])', form).forEach(c => o[c.name] = c.checked);
    if (onSave(o, form) !== false) close();
  };
  const f1 = $('input:not([type=hidden]),select,textarea', form); if (f1) setTimeout(() => f1.focus(), 30);
  document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc_); } });
  return ov;
}
const fld = (label, inner, cls = '') => `<label class="f ${cls}">${label}${inner}</label>`;
const inp = (name, val = '', type = 'text', attrs = '') => `<input type="${type}" name="${name}" value="${esc(val)}" ${attrs}>`;

/* ---------- Dashboard ---------- */
function vDashboard() {
  const d = today(), ws = wochenStart(), ms = d.slice(0, 7), y = d.slice(0, 4);
  const wMin = sumMin(S.logs.filter(l => l.datum >= ws && l.datum <= d)), mMin = sumMin(S.logs.filter(l => (l.datum || '').startsWith(ms)));
  const off = offeneLogs(), offW = off.reduce((a, l) => a + logWert(l), 0) + offeneSpesen().reduce((a, s) => a + num(s.betrag), 0);
  const ro = S.rechnungen.filter(r => r.status === 'offen'), roSum = ro.reduce((a, r) => a + num(r.total), 0), roUeber = ro.filter(r => r.faellig && r.faellig < d).length;
  const ums = umsatzJahr(y), gr = num(S.set.mwstGrenze) || 100000, pct = Math.min(100, ums / gr * 100);
  const todos = []; S.projekte.filter(p => p.status !== 'Abgeschlossen').forEach(p => (p.todos || []).filter(t => !t.erledigt).forEach(t => todos.push({ p, t })));
  todos.sort((a, b) => (a.t.faellig || '9999') < (b.t.faellig || '9999') ? -1 : 1);
  const aktiv = S.projekte.filter(p => p.status === 'Aktiv');
  const letzte = [...S.logs].sort((a, b) => (b.datum + (b.geaendert || '')).localeCompare(a.datum + (a.geaendert || ''))).slice(0, 8);
  const leer = !S.firmen.length ? `<div class="card"><h2>Erste Schritte</h2><ol style="margin:0;padding-left:18px;line-height:1.9"><li><a href="#/einstellungen">Einstellungen</a>: eigene Adresse und IBAN erfassen</li><li><a href="#/firmen">Firma</a> mit Ansprechpartner und Stundensatz anlegen</li><li><a href="#/projekte">Projekt</a> anlegen</li><li>In der <a href="#/logs">Zeiterfassung</a> Tätigkeiten erfassen</li><li><a href="#/rechnungen">Rechnung</a> erstellen</li></ol></div>` : '';
  return `<div class="head"><h1>Dashboard<span class="sub">${fmt(d)}</span></h1><button class="btn pri" data-act="logNeu">+ Tätigkeit</button></div>${leer}
  <div class="kpis">
    <div class="kpi"><span>Diese Woche</span><b>${hm(wMin)} h</b></div>
    <div class="kpi"><span>${MON[+ms.slice(5) - 1]}</span><b>${hm(mMin)} h</b></div>
    <div class="kpi"><span>Noch nicht verrechnet</span><b>CHF ${chf(offW)}</b><small>${hm(sumMin(off))} h</small></div>
    <div class="kpi"><span>Offene Rechnungen</span><b>CHF ${chf(roSum)}</b><small>${ro.length} offen${roUeber ? ` · <span style="color:var(--red)">${roUeber} überfällig</span>` : ''}</small></div>
    <div class="kpi"><span>Umsatz ${y} / MWST-Grenze</span><b>CHF ${chf(ums)}</b><div class="bar ${pct > 80 ? 'warn' : ''}"><i style="width:${pct}%"></i></div><small>${pct.toFixed(0)}% von CHF ${chf(gr).replace('.00', '')}</small></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>Offene To-dos</h2>${todos.length ? `<div class="list">${todos.slice(0, 12).map(({ p, t }) => `<div class="li"><input type="checkbox" class="chk" data-act="todoToggle" data-p="${p.id}" data-t="${t.id}"><div class="grow">${esc(t.text)}<div class="small muted"><a href="#/projekt/${p.id}">${esc(p.name)}</a> · ${esc(fName(p.firmaId))}</div></div>${t.faellig ? `<span class="b ${t.faellig < d ? 'red' : t.faellig <= addDays(d, 7) ? 'warn' : ''}">${fmt(t.faellig)}</span>` : ''}</div>`).join('')}</div>` : '<div class="empty">Keine offenen To-dos</div>'}</div>
    <div class="card"><h2>Aktive Projekte</h2>${aktiv.length ? `<div class="list">${aktiv.map(p => { const ol = offeneLogs().filter(l => l.projektId === p.id); return `<a class="li" href="#/projekt/${p.id}" style="text-decoration:none;color:inherit"><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(fName(p.firmaId))}</div></div><span class="small muted">${hm(sumMin(ol))} h offen</span></a>`; }).join('')}</div>` : '<div class="empty">Keine aktiven Projekte</div>'}</div>
  </div>
  <div class="card"><h2>Zuletzt erfasst</h2>${logTable(letzte, false)}</div>`;
}

/* ---------- Zeiterfassung ---------- */
function logTable(ls, gruppiert = true) {
  if (!ls.length) return '<div class="empty">Keine Einträge</div>';
  ls = [...ls].sort((a, b) => b.datum.localeCompare(a.datum) || (b.geaendert || 0) - (a.geaendert || 0));
  let last = '', rows = '';
  for (const l of ls) {
    if (gruppiert && l.datum !== last) { last = l.datum; const tm = sumMin(ls.filter(x => x.datum === l.datum)); rows += `<tr class="day"><td colspan="4">${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][pd(l.datum).getDay()]}, ${fmt(l.datum)}</td><td class="num">${hm(tm)}</td><td></td></tr>`; }
    const p = projekt(l.projektId);
    const st = l.rechnungId ? '<span class="b blue">verrechnet</span>' : l.verrechenbar === false ? '<span class="b">intern</span>' : '<span class="b green">offen</span>';
    rows += `<tr class="click" data-act="logEdit" data-id="${l.id}">${gruppiert ? '' : `<td class="nowrap">${fmt(l.datum)}</td>`}<td>${p ? `<b>${esc(p.name)}</b><div class="small muted">${esc(fName(p.firmaId))}</div>` : '<span class="muted">-</span>'}</td><td>${esc(l.text)}</td><td>${(l.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</td>${gruppiert ? '<td></td>' : ''}<td class="num">${hm(l.minuten)}</td><td class="num">${st}</td></tr>`;
  }
  return `<div class="tablewrap"><table class="t"><thead><tr>${gruppiert ? '' : '<th>Datum</th>'}<th>Projekt</th><th>Tätigkeit</th><th>Tags</th>${gruppiert ? '<th></th>' : ''}<th class="num">Dauer</th><th class="num">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function logFilter() {
  return S.logs.filter(l => (!UI.logMonat || (l.datum || '').startsWith(UI.logMonat)) && (!UI.logFirma || logFirma(l) === UI.logFirma) && (!UI.logProjekt || l.projektId === UI.logProjekt)
    && (!UI.logTag || (l.tags || []).includes(UI.logTag)) && (!UI.logStatus || (UI.logStatus === 'offen' ? !l.rechnungId && l.verrechenbar !== false : UI.logStatus === 'verrechnet' ? !!l.rechnungId : l.verrechenbar === false)));
}
function vLogs() {
  const q = UI.qa, ls = logFilter(), tot = sumMin(ls), ver = sumMin(ls.filter(l => l.verrechenbar !== false)), wert = ls.reduce((a, l) => a + logWert(l), 0);
  let qtags = []; try { qtags = JSON.parse(q.tags || '[]'); } catch (e) { }
  return `<div class="head"><h1>Zeiterfassung</h1><button class="btn" data-act="csv">CSV-Export</button><button class="btn" data-act="timerStartQA">Timer starten</button></div>
  <form class="card" id="quick" autocomplete="off"><div class="quick">
    ${fld('Datum', `<input type="date" name="datum" data-qa="datum" value="${esc(q.datum)}">`)}
    ${fld('Projekt', `<select name="projektId" data-qa="projektId">${projektOptions(q.projektId)}</select>`)}
    ${fld('Tätigkeit', `<input type="text" name="text" data-qa="text" value="${esc(q.text)}" placeholder="Was hast du gemacht?">`)}
    ${fld('Dauer', `<input type="text" name="dauer" data-qa="dauer" value="${esc(q.dauer)}" placeholder="1:30">`)}
    ${fld('Tags', tagInput('tags', qtags, true))}
    <label class="chk" style="padding-bottom:10px"><input type="checkbox" name="verrechenbar" data-qa="verrechenbar" ${q.verrechenbar ? 'checked' : ''}>verrechenbar</label>
    <button class="btn pri" type="submit" style="height:38px">Erfassen</button>
  </div><div class="small muted" style="margin-top:6px">Dauer: 1:30 oder 1.5 (Stunden) oder 45m (Minuten)</div></form>
  <div class="filters">
    ${fld('Monat', `<input type="month" data-ui="logMonat" value="${esc(UI.logMonat)}">`)}
    ${fld('Firma', `<select data-ui="logFirma">${firmaOptions(UI.logFirma, 'Alle Firmen')}</select>`)}
    ${fld('Projekt', `<select data-ui="logProjekt">${projektOptions(UI.logProjekt, false).replace('- Projekt wählen -', 'Alle Projekte')}</select>`)}
    ${fld('Tag', `<select data-ui="logTag"><option value="">Alle Tags</option>${allTags().map(t => `<option ${t === UI.logTag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`)}
    ${fld('Status', `<select data-ui="logStatus">${[['', 'Alle'], ['offen', 'Offen (verrechenbar)'], ['verrechnet', 'Verrechnet'], ['intern', 'Nicht verrechenbar']].map(([v, t]) => `<option value="${v}" ${v === UI.logStatus ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
    <button class="btn sm" data-act="alleMonate">${UI.logMonat ? 'Alle Monate' : 'Aktueller Monat'}</button>
  </div>
  <div class="kpis"><div class="kpi"><span>Total</span><b>${hm(tot)} h</b></div><div class="kpi"><span>Verrechenbar</span><b>${hm(ver)} h</b></div><div class="kpi"><span>Wert verrechenbar</span><b>CHF ${chf(wert)}</b></div></div>
  <div class="card">${logTable(ls)}</div>`;
}
function logModal(l = {}, after) {
  const neu = !l.id;
  modal({
    title: neu ? 'Tätigkeit erfassen' : 'Tätigkeit bearbeiten',
    body: `${l.rechnungId ? `<div class="note" style="margin-bottom:10px">Bereits verrechnet (Rechnung ${esc((S.rechnungen.find(r => r.id === l.rechnungId) || {}).nr || '')}). Änderungen wirken nicht auf die Rechnung.</div>` : ''}
      <div class="frow c2">${fld('Datum', inp('datum', l.datum || today(), 'date'))}${fld('Dauer', inp('dauer', l.minuten ? hm(l.minuten) : '', 'text', 'placeholder="1:30"'))}</div>
      <div class="frow">${fld('Projekt', `<select name="projektId">${projektOptions(l.projektId || '')}</select>`)}</div>
      <div class="frow">${fld('Tätigkeit', `<textarea name="text" rows="3">${esc(l.text || '')}</textarea>`)}</div>
      <div class="frow">${fld('Tags', tagInput('tags', l.tags || []))}</div>
      <label class="chk"><input type="checkbox" name="verrechenbar" ${l.verrechenbar !== false ? 'checked' : ''}>verrechenbar</label>`,
    onSave: o => {
      const min = parseDauer(o.dauer); if (!min) { toast('Dauer fehlt oder ungültig'); return false; }
      if (!o.projektId) { toast('Projekt wählen'); return false; }
      put('logs', { ...l, datum: o.datum || today(), projektId: o.projektId, text: o.text, minuten: min, tags: JSON.parse(o.tags || '[]'), verrechenbar: o.verrechenbar });
      after && after(); toast('Gespeichert');
    },
    onDelete: neu ? null : () => { if (l.rechnungId) { toast('Verrechnete Tätigkeit: zuerst Rechnung löschen'); return; } del('logs', l.id); }
  });
}
function quickSave(form) {
  const o = Object.fromEntries(new FormData(form)); const min = parseDauer(o.dauer);
  const box = $('[data-tagin]', form), tt = $('.tagtxt', box); let tags = JSON.parse(o.tags || '[]'); if (tt.value.trim() && !tags.includes(tt.value.trim())) tags.push(tt.value.trim());
  if (!o.projektId) return toast('Projekt wählen');
  if (!min) return toast('Dauer fehlt oder ungültig (z.B. 1:30)');
  put('logs', { datum: o.datum || today(), projektId: o.projektId, text: (o.text || '').trim(), minuten: min, tags, verrechenbar: !!o.verrechenbar });
  UI.qa = { ...UI.qa, text: '', dauer: '', tags: '[]' }; document.activeElement && document.activeElement.blur(); toast('Erfasst'); schedule();
}
function csvExport() {
  const ls = logFilter().sort((a, b) => a.datum.localeCompare(b.datum));
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Firma', 'Projekt', 'Tätigkeit', 'Tags', 'Stunden', 'Ansatz', 'Betrag', 'Verrechenbar', 'Rechnung']].concat(ls.map(l => { const p = projekt(l.projektId); return [fmt(l.datum), p ? fName(p.firmaId) : '', p ? p.name : '', l.text, (l.tags || []).join(', '), hdec(l.minuten), ansatz(p), logWert(l).toFixed(2), l.verrechenbar === false ? 'nein' : 'ja', (S.rechnungen.find(r => r.id === l.rechnungId) || {}).nr || '']; }));
  download('﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), `zeiterfassung_${UI.logMonat || 'alle'}.csv`, 'text/csv');
}
function download(data, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------- Firmen ---------- */
function vFirmen() {
  const fs = sortFirmen();
  return `<div class="head"><h1>Firmen</h1><button class="btn pri" data-act="firmaNeu">+ Firma</button></div>
  <div class="card">${fs.length ? `<table class="t"><thead><tr><th>Firma</th><th>Ort</th><th>Ansprechpartner</th><th class="num">Ansatz</th><th class="num">Projekte</th><th class="num">Offen</th></tr></thead><tbody>${fs.map(f => { const ol = offeneLogs(f.id); return `<tr class="click" data-href="#/firma/${f.id}"><td><b>${esc(f.name)}</b>${f.archiv ? ' <span class="b">archiviert</span>' : ''}</td><td>${esc([f.plz, f.ort].filter(Boolean).join(' '))}</td><td>${esc((f.kontakte || []).map(k => k.name).join(', '))}</td><td class="num">${f.ansatz ? 'CHF ' + chf(num(f.ansatz)) : '-'}</td><td class="num">${S.projekte.filter(p => p.firmaId === f.id && p.status !== 'Abgeschlossen').length}</td><td class="num">${hm(sumMin(ol))} h</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">Noch keine Firmen erfasst</div>'}</div>`;
}
function vFirma(id) {
  const f = firma(id); if (!f) return '<div class="empty">Firma nicht gefunden</div>';
  const ps = S.projekte.filter(p => p.firmaId === id), rs = S.rechnungen.filter(r => r.firmaId === id).sort((a, b) => b.datum.localeCompare(a.datum));
  const ol = offeneLogs(id), ow = ol.reduce((a, l) => a + logWert(l), 0) + offeneSpesen(id).reduce((a, s) => a + num(s.betrag), 0);
  return `<div class="head"><h1><a href="#/firmen" class="small" style="text-decoration:none">‹ Firmen</a><br>${esc(f.name)}<span class="sub">${esc(adrZeilen(f).join(', '))}</span></h1><button class="btn" data-act="firmaEdit" data-id="${id}">Bearbeiten</button><button class="btn" data-act="projektNeu" data-firma="${id}">+ Projekt</button>${ol.length ? `<button class="btn pri" data-act="rechnungNeu" data-firma="${id}">Rechnung erstellen</button>` : ''}</div>
  <div class="kpis"><div class="kpi"><span>Stundensatz</span><b>${f.ansatz ? 'CHF ' + chf(num(f.ansatz)) : '-'}</b></div><div class="kpi"><span>Nicht verrechnet</span><b>CHF ${chf(ow)}</b><small>${hm(sumMin(ol))} h</small></div><div class="kpi"><span>Verrechnet total</span><b>CHF ${chf(rs.filter(r => r.status !== 'storniert').reduce((a, r) => a + num(r.total), 0))}</b></div></div>
  <div class="grid g2">
    <div class="card"><h2>Ansprechpartner</h2>${(f.kontakte || []).length ? `<div class="list">${f.kontakte.map(k => `<div class="li"><div class="grow"><b>${esc(k.name)}</b>${k.funktion ? ` <span class="muted">· ${esc(k.funktion)}</span>` : ''}<div class="small">${k.email ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ''}${k.email && k.tel ? ' · ' : ''}${k.tel ? `<a href="tel:${esc(k.tel)}">${esc(k.tel)}</a>` : ''}</div></div></div>`).join('')}</div>` : '<div class="empty">Keine Ansprechpartner</div>'}${f.notiz ? `<p class="small" style="white-space:pre-wrap;margin-top:10px">${esc(f.notiz)}</p>` : ''}</div>
    <div class="card"><h2>Projekte</h2>${ps.length ? `<div class="list">${ps.map(p => `<a class="li" href="#/projekt/${p.id}" style="text-decoration:none;color:inherit"><div class="grow"><b>${esc(p.name)}</b><div class="small muted">Ansatz CHF ${chf(ansatz(p))}${num(p.ansatz) ? '' : ' (Firma)'}</div></div><span class="b ${STC[p.status] || ''}">${esc(p.status)}</span></a>`).join('')}</div>` : '<div class="empty">Keine Projekte</div>'}</div>
  </div>
  <div class="card"><h2>Rechnungen</h2>${rTable(rs)}</div>`;
}
function kRow(k = {}) { return `<div class="krow"><input type="hidden" name="kid[]" value="${esc(k.id || uid())}"><input type="text" name="kname[]" placeholder="Name" value="${esc(k.name || '')}"><input type="text" name="kfunktion[]" placeholder="Funktion" value="${esc(k.funktion || '')}"><input type="email" name="kemail[]" placeholder="E-Mail" value="${esc(k.email || '')}"><input type="tel" name="ktel[]" placeholder="Telefon" value="${esc(k.tel || '')}"><button type="button" class="btn sm ghost" data-act="kDel">✕</button></div>`; }
function firmaModal(f = {}) {
  modal({
    title: f.id ? 'Firma bearbeiten' : 'Neue Firma', wide: true,
    body: `<div class="frow c2">${fld('Firmenname', inp('name', f.name))}${fld('Stundensatz CHF (Standard)', inp('ansatz', f.ansatz || '', 'number', 'step="0.05" min="0"'))}</div>
      <div class="frow c4">${fld('Strasse', inp('strasse', f.strasse))}${fld('Nr.', inp('nr', f.nr))}${fld('PLZ', inp('plz', f.plz))}${fld('Ort', inp('ort', f.ort))}</div>
      <div class="frow c4">${fld('Land', inp('land', f.land || 'CH', 'text', 'maxlength="2"'))}</div>
      <h2 style="margin-top:14px">Ansprechpartner</h2><div id="krows">${(f.kontakte && f.kontakte.length ? f.kontakte : [{}]).map(kRow).join('')}</div><button type="button" class="btn sm" data-act="kAdd">+ Ansprechpartner</button>
      <div class="frow" style="margin-top:12px">${fld('Notiz', `<textarea name="notiz" rows="2">${esc(f.notiz || '')}</textarea>`)}</div>
      ${f.id ? `<label class="chk"><input type="checkbox" name="archiv" ${f.archiv ? 'checked' : ''}>archiviert</label>` : ''}`,
    onSave: o => {
      if (!o.name) { toast('Firmenname fehlt'); return false; }
      const kontakte = (o.kname || []).map((n, i) => ({ id: o.kid[i], name: n.trim(), funktion: (o.kfunktion[i] || '').trim(), email: (o.kemail[i] || '').trim(), tel: (o.ktel[i] || '').trim() })).filter(k => k.name);
      const x = put('firmen', { ...f, name: o.name, ansatz: num(o.ansatz), strasse: o.strasse, nr: o.nr, plz: o.plz, ort: o.ort, land: (o.land || 'CH').toUpperCase(), notiz: o.notiz, kontakte, archiv: !!o.archiv });
      if (!f.id) location.hash = '#/firma/' + x.id;
    },
    onDelete: f.id ? () => { if (S.projekte.some(p => p.firmaId === f.id)) { toast('Firma hat Projekte - zuerst löschen oder archivieren'); return; } del('firmen', f.id); location.hash = '#/firmen'; } : null
  });
}

/* ---------- Projekte ---------- */
function vProjekte() {
  const ps = S.projekte.filter(p => UI.pStatus === 'alle' || (UI.pStatus === 'offen' ? p.status !== 'Abgeschlossen' : p.status === UI.pStatus))
    .sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status) || a.name.localeCompare(b.name, 'de'));
  return `<div class="head"><h1>Projekte</h1><div class="seg">${[['offen', 'Offen'], ...STATUS.map(s => [s, s]), ['alle', 'Alle']].map(([v, t]) => `<button data-act="pStatus" data-v="${v}" class="${UI.pStatus === v ? 'on' : ''}">${t}</button>`).join('')}</div><button class="btn pri" data-act="projektNeu">+ Projekt</button></div>
  ${ps.length ? `<div class="pcards">${ps.map(p => { const ls = S.logs.filter(l => l.projektId === p.id), td = (p.todos || []).filter(t => !t.erledigt).length; return `<a class="pcard" href="#/projekt/${p.id}"><span class="b ${STC[p.status] || ''}">${esc(p.status)}</span><h3>${esc(p.name)}</h3><div class="small muted">${esc(fName(p.firmaId))}</div><div class="meta"><span>${hm(sumMin(ls))} h total</span><span>${td} To-do${td === 1 ? '' : 's'}</span><span>CHF ${chf(ansatz(p))}/h</span></div></a>`; }).join('')}</div>` : '<div class="card empty">Keine Projekte</div>'}`;
}
function vProjekt(id) {
  const p = projekt(id); if (!p) return '<div class="empty">Projekt nicht gefunden</div>';
  const f = pFirma(p) || {}, ls = S.logs.filter(l => l.projektId === id), ol = ls.filter(l => !l.rechnungId && l.verrechenbar !== false);
  const pers = (f.kontakte || []).filter(k => (p.personen || []).includes(k.id));
  const todos = [...(p.todos || [])].sort((a, b) => (a.erledigt - b.erledigt) || ((a.faellig || '9999') < (b.faellig || '9999') ? -1 : 1));
  const d = today();
  return `<div class="head"><h1><a href="#/projekte" class="small" style="text-decoration:none">‹ Projekte</a><br>${esc(p.name)}<span class="sub"><a href="#/firma/${f.id}">${esc(f.name || '?')}</a> · <span class="b ${STC[p.status] || ''}">${esc(p.status)}</span>${p.start || p.ende ? ` · ${fmt(p.start)} - ${fmt(p.ende)}` : ''}</span></h1>
    <button class="btn" data-act="projektEdit" data-id="${id}">Bearbeiten</button><button class="btn" data-act="timerStartP" data-id="${id}">Timer starten</button><button class="btn pri" data-act="logNeuP" data-id="${id}">+ Tätigkeit</button></div>
  <div class="kpis"><div class="kpi"><span>Stundensatz</span><b>CHF ${chf(ansatz(p))}</b><small>${num(p.ansatz) ? 'Projektansatz' : 'Standard der Firma'}</small></div><div class="kpi"><span>Stunden total</span><b>${hm(sumMin(ls))} h</b></div><div class="kpi"><span>Nicht verrechnet</span><b>CHF ${chf(ol.reduce((a, l) => a + logWert(l), 0))}</b><small>${hm(sumMin(ol))} h</small></div></div>
  ${p.beschreibung ? `<div class="card" style="white-space:pre-wrap">${esc(p.beschreibung)}</div>` : ''}
  <div class="grid g2">
    <div class="card"><h2>To-dos</h2><form class="frow" data-form="todoAdd" data-p="${id}" style="grid-template-columns:1fr 140px auto"><input type="text" name="text" placeholder="Neues To-do"><input type="date" name="faellig"><button class="btn pri">+</button></form>
      ${todos.length ? `<div class="list">${todos.map(t => `<div class="li ${t.erledigt ? 'done' : ''}"><input type="checkbox" data-act="todoToggle" data-p="${id}" data-t="${t.id}" ${t.erledigt ? 'checked' : ''}><div class="grow">${esc(t.text)}</div>${t.faellig ? `<span class="b ${!t.erledigt && t.faellig < d ? 'red' : ''}">${fmt(t.faellig)}</span>` : ''}<button class="btn sm ghost" data-act="todoDel" data-p="${id}" data-t="${t.id}">✕</button></div>`).join('')}</div>` : '<div class="empty">Keine To-dos</div>'}</div>
    <div class="card"><h2>Personen</h2>${pers.length ? `<div class="list">${pers.map(k => `<div class="li"><div class="grow"><b>${esc(k.name)}</b>${k.funktion ? ` <span class="muted">· ${esc(k.funktion)}</span>` : ''}<div class="small">${k.email ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ''}${k.email && k.tel ? ' · ' : ''}${k.tel ? esc(k.tel) : ''}</div></div></div>`).join('')}</div>` : '<div class="empty">Keine Personen zugeordnet (Bearbeiten)</div>'}
      <h2 style="margin-top:16px">Links &amp; Dokumente</h2><form class="frow" data-form="linkAdd" data-p="${id}" style="grid-template-columns:1fr 1.4fr auto"><input type="text" name="titel" placeholder="Titel"><input type="url" name="url" placeholder="https://..."><button class="btn pri">+</button></form>
      ${(p.links || []).length ? `<div class="list">${p.links.map(k => `<div class="li"><div class="grow"><a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.titel || k.url)}</a></div><button class="btn sm ghost" data-act="linkDel" data-p="${id}" data-t="${k.id}">✕</button></div>`).join('')}</div>` : ''}</div>
  </div>
  <div class="card"><h2>Notizen / Protokolle</h2><form data-form="notizAdd" data-p="${id}"><div class="frow" style="grid-template-columns:140px 1fr auto;align-items:start"><input type="date" name="datum" value="${today()}"><textarea name="text" rows="2" placeholder="Notiz, Meeting-Protokoll ..."></textarea><button class="btn pri">+</button></div></form>
    ${(p.notizen || []).length ? `<div class="list">${[...p.notizen].sort((a, b) => b.datum.localeCompare(a.datum)).map(n => `<div class="li" style="align-items:flex-start"><span class="small muted nowrap" style="width:80px">${fmt(n.datum)}</span><div class="grow" style="white-space:pre-wrap">${esc(n.text)}</div><button class="btn sm ghost" data-act="notizDel" data-p="${id}" data-t="${n.id}">✕</button></div>`).join('')}</div>` : ''}</div>
  <div class="card"><h2>Tätigkeiten</h2>${logTable(ls, false)}</div>`;
}
function persBox(firmaId, sel = []) { const f = firma(firmaId); return f && (f.kontakte || []).length ? f.kontakte.map(k => `<label class="chk"><input type="checkbox" name="personen[]" value="${k.id}" ${sel.includes(k.id) ? 'checked' : ''}>${esc(k.name)}${k.funktion ? ` <span class="muted">(${esc(k.funktion)})</span>` : ''}</label>`).join('') : '<span class="small muted">Keine Ansprechpartner bei dieser Firma erfasst</span>'; }
function projektModal(p = {}) {
  const ov = modal({
    title: p.id ? 'Projekt bearbeiten' : 'Neues Projekt', wide: true,
    body: `<div class="frow c2">${fld('Projektname', inp('name', p.name))}${fld('Firma', `<select name="firmaId" id="pmFirma">${firmaOptions(p.firmaId)}</select>`)}</div>
      <div class="frow c4">${fld('Status', `<select name="status">${STATUS.map(s => `<option ${s === (p.status || 'Aktiv') ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}${fld('Stundensatz CHF', inp('ansatz', p.ansatz || '', 'number', `step="0.05" min="0" id="pmAnsatz" placeholder="${p.firmaId ? 'Firma: ' + chf(num((firma(p.firmaId) || {}).ansatz)) : 'Standard Firma'}"`))}${fld('Start', inp('start', p.start, 'date'))}${fld('Ende', inp('ende', p.ende, 'date'))}</div>
      <div class="small muted" style="margin:-4px 0 10px">Stundensatz leer = Standard der Firma</div>
      <div class="frow">${fld('Beschreibung / Ziel', `<textarea name="beschreibung" rows="3">${esc(p.beschreibung || '')}</textarea>`)}</div>
      <div class="f" style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px">Personen</div><div id="pmPers" style="display:flex;flex-wrap:wrap;gap:6px 16px">${persBox(p.firmaId, p.personen || [])}</div>`,
    onSave: o => {
      if (!o.name || !o.firmaId) { toast('Name und Firma erfassen'); return false; }
      const x = put('projekte', { todos: [], notizen: [], links: [], ...p, name: o.name, firmaId: o.firmaId, status: o.status, ansatz: num(o.ansatz), start: o.start, ende: o.ende, beschreibung: o.beschreibung, personen: o.personen || [] });
      if (!p.id) location.hash = '#/projekt/' + x.id;
    },
    onDelete: p.id ? () => { if (S.logs.some(l => l.projektId === p.id)) { toast('Projekt hat Tätigkeiten - Status "Abgeschlossen" setzen statt löschen'); return; } del('projekte', p.id); location.hash = '#/projekte'; } : null
  });
  $('#pmFirma', ov).onchange = e => { $('#pmPers', ov).innerHTML = persBox(e.target.value, []); $('#pmAnsatz', ov).placeholder = e.target.value ? 'Firma: ' + chf(num((firma(e.target.value) || {}).ansatz)) : 'Standard Firma'; };
}
function pListe(pid, key, fn) { const p = projekt(pid); if (!p) return; put('projekte', { ...p, [key]: fn([...(p[key] || [])]) }); }

/* ---------- Spesen ---------- */
function vSpesen() {
  const ss = S.spesen.filter(s => !UI.spJahr || (s.datum || '').startsWith(UI.spJahr)).sort((a, b) => b.datum.localeCompare(a.datum));
  const jahre = [...new Set([String(new Date().getFullYear()), ...S.spesen.map(s => (s.datum || '').slice(0, 4))])].filter(Boolean).sort().reverse();
  return `<div class="head"><h1>Spesen</h1><select data-ui="spJahr" style="width:auto">${jahre.map(j => `<option ${j === UI.spJahr ? 'selected' : ''}>${j}</option>`).join('')}<option value="" ${!UI.spJahr ? 'selected' : ''}>Alle</option></select><button class="btn pri" data-act="spesenNeu">+ Spesen</button></div>
  <div class="card">${ss.length ? `<table class="t"><thead><tr><th>Datum</th><th>Projekt</th><th>Beschreibung</th><th class="num">Betrag CHF</th><th class="num">Status</th></tr></thead><tbody>${ss.map(s => { const p = projekt(s.projektId); return `<tr class="click" data-act="spesenEdit" data-id="${s.id}"><td class="nowrap">${fmt(s.datum)}</td><td>${p ? `<b>${esc(p.name)}</b><div class="small muted">${esc(fName(p.firmaId))}</div>` : '-'}</td><td>${esc(s.text)}</td><td class="num">${chf(num(s.betrag))}</td><td class="num">${s.rechnungId ? '<span class="b blue">verrechnet</span>' : s.verrechenbar === false ? '<span class="b">intern</span>' : '<span class="b green">offen</span>'}</td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="3">Total</td><td class="num">${chf(ss.reduce((a, s) => a + num(s.betrag), 0))}</td><td></td></tr></tfoot></table>` : '<div class="empty">Keine Spesen</div>'}</div>`;
}
function spesenModal(s = {}) {
  modal({
    title: s.id ? 'Spesen bearbeiten' : 'Spesen erfassen',
    body: `<div class="frow c2">${fld('Datum', inp('datum', s.datum || today(), 'date'))}${fld('Betrag CHF', inp('betrag', s.betrag || '', 'number', 'step="0.05" min="0"'))}</div>
      <div class="frow">${fld('Projekt', `<select name="projektId">${projektOptions(s.projektId || '')}</select>`)}</div>
      <div class="frow">${fld('Beschreibung', inp('text', s.text, 'text', 'placeholder="z.B. Fahrt Etzgen 2x 24 km"'))}</div>
      <label class="chk"><input type="checkbox" name="verrechenbar" ${s.verrechenbar !== false ? 'checked' : ''}>verrechenbar</label>`,
    onSave: o => { if (!o.projektId || !num(o.betrag)) { toast('Projekt und Betrag erfassen'); return false; } put('spesen', { ...s, datum: o.datum, betrag: num(o.betrag), projektId: o.projektId, text: o.text, verrechenbar: o.verrechenbar }); },
    onDelete: s.id ? () => { if (s.rechnungId) { toast('Bereits verrechnet - zuerst Rechnung löschen'); return; } del('spesen', s.id); } : null
  });
}

/* ---------- Rechnungen ---------- */
const RST = { offen: 'warn', bezahlt: 'green', storniert: '' };
function rTable(rs) {
  const d = today();
  return rs.length ? `<table class="t"><thead><tr><th>Nr.</th><th>Datum</th><th>Firma</th><th>Bemerkung</th><th class="num">Betrag CHF</th><th class="num">Fällig</th><th class="num">Status</th><th></th></tr></thead><tbody>${rs.map(r => `<tr class="click" data-act="rechnungEdit" data-id="${r.id}"><td><b>${esc(r.nr)}</b></td><td class="nowrap">${fmt(r.datum)}</td><td>${esc(fName(r.firmaId))}</td><td>${esc(r.bemerkung || '')}</td><td class="num">${chf(num(r.total))}</td><td class="num">${r.status === 'offen' && r.faellig < d ? `<span class="b red">${fmt(r.faellig)}</span>` : fmt(r.faellig)}</td><td class="num"><span class="b ${RST[r.status] || ''}">${esc(r.status)}</span></td><td class="num"><button class="btn sm" data-act="pdf" data-id="${r.id}">PDF</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Keine Rechnungen</div>';
}
function vRechnungen() {
  const rs = S.rechnungen.filter(r => !UI.rStatus || r.status === UI.rStatus).sort((a, b) => b.nr.localeCompare(a.nr, 'de', { numeric: true }));
  const warn = !S.set.iban || !S.set.strasse || !S.set.plz ? `<div class="note" style="margin-bottom:12px">Für den QR-Zahlteil fehlen Angaben: <a href="#/einstellungen">Einstellungen</a> (IBAN, Adresse).</div>` : '';
  const offF = sortFirmen().map(f => ({ f, n: offeneLogs(f.id).length + offeneSpesen(f.id).length })).filter(x => x.n);
  return `<div class="head"><h1>Rechnungen</h1><div class="seg">${[['', 'Alle'], ['offen', 'Offen'], ['bezahlt', 'Bezahlt'], ['storniert', 'Storniert']].map(([v, t]) => `<button data-act="rStatus" data-v="${v}" class="${UI.rStatus === v ? 'on' : ''}">${t}</button>`).join('')}</div><button class="btn pri" data-act="rechnungNeu">+ Rechnung</button></div>${warn}
  ${offF.length ? `<div class="card"><h2>Bereit zur Verrechnung</h2><div class="list">${offF.map(({ f }) => { const w = offeneLogs(f.id).reduce((a, l) => a + logWert(l), 0) + offeneSpesen(f.id).reduce((a, s) => a + num(s.betrag), 0); return `<div class="li"><div class="grow"><b>${esc(f.name)}</b><div class="small muted">${hm(sumMin(offeneLogs(f.id)))} h · ${offeneSpesen(f.id).length} Spesen</div></div><b>CHF ${chf(w)}</b><button class="btn sm pri" data-act="rechnungNeu" data-firma="${f.id}">Rechnung erstellen</button></div>`; }).join('')}</div></div>` : ''}
  <div class="card">${rTable(rs)}</div>`;
}
function naechsteNr(datum) { const y = datum.slice(0, 4); const n = S.rechnungen.filter(r => (r.nr || '').startsWith(y + '-')).map(r => parseInt(r.nr.slice(5)) || 0); return `${y}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`; }
function positionen(logs, spesen) {
  const g = {};
  for (const l of logs) { const p = projekt(l.projektId), a = ansatz(p), k = l.projektId + '|' + a; (g[k] = g[k] || { p, a, min: 0 }).min += l.minuten; }
  const pos = Object.values(g).map(x => { const h = r01(x.min / 60); return { text: x.p ? x.p.name : 'Leistungen', sub: 'Leistungen gemäss Rapport', menge: h, einheit: 'Std.', ansatz: x.a, betrag: r05(h * x.a) }; });
  for (const s of spesen) pos.push({ text: s.text || 'Spesen', sub: `Spesen vom ${fmt(s.datum)}${s.projektId ? ' · ' + pName(s.projektId) : ''}`, menge: 1, einheit: 'Pausch.', ansatz: num(s.betrag), betrag: r05(num(s.betrag)) });
  return pos;
}
function rechnungNeu(firmaId = '') {
  const ov = modal({
    title: 'Neue Rechnung', wide: true, saveTxt: 'Rechnung erstellen',
    body: `<div class="frow c4">${fld('Firma', `<select name="firmaId" id="rnFirma">${firmaOptions(firmaId)}</select>`)}${fld('Leistungen bis', inp('bis', today(), 'date', 'id="rnBis"'))}${fld('Rechnungsdatum', inp('datum', today(), 'date'))}${fld('Zahlungsfrist (Tage)', inp('frist', S.set.frist || 30, 'number', 'min="0"'))}</div>
      <div class="frow">${fld('Bemerkung (erscheint auf Rechnung und QR-Zahlteil)', inp('bemerkung', `Leistungen ${monTxt(today().slice(0, 7))}`, 'text'))}</div>
      <div id="rnListe"></div>`,
    onSave: o => {
      const logs = (o.log || []).map(id => S.logs.find(l => l.id === id)).filter(Boolean), sp = (o.sp || []).map(id => S.spesen.find(s => s.id === id)).filter(Boolean);
      if (!o.firmaId) { toast('Firma wählen'); return false; }
      if (!logs.length && !sp.length) { toast('Keine Positionen ausgewählt'); return false; }
      const f = firma(o.firmaId), pos = positionen(logs, sp), total = r05(pos.reduce((a, p) => a + p.betrag, 0));
      const r = put('rechnungen', {
        nr: naechsteNr(o.datum), firmaId: o.firmaId, datum: o.datum, faellig: addDays(o.datum, num(o.frist)), bemerkung: o.bemerkung, status: 'offen', positionen: pos, total,
        empfaenger: { name: f.name, strasse: f.strasse || '', nr: f.nr || '', plz: f.plz || '', ort: f.ort || '', land: f.land || 'CH' },
        rapport: [...logs].sort((a, b) => a.datum.localeCompare(b.datum)).map(l => ({ datum: l.datum, projekt: pName(l.projektId), text: l.text, tags: l.tags || [], minuten: l.minuten })),
        logIds: logs.map(l => l.id), spesenIds: sp.map(s => s.id)
      });
      logs.forEach(l => put('logs', { ...l, rechnungId: r.id })); sp.forEach(s => put('spesen', { ...s, rechnungId: r.id }));
      toast(`Rechnung ${r.nr} erstellt`); setTimeout(() => rechnungPdf(r), 100);
    }
  });
  const upd = () => {
    const fid = $('#rnFirma', ov).value, bis = $('#rnBis', ov).value || today(), box = $('#rnListe', ov);
    if (!fid) { box.innerHTML = '<div class="empty">Firma wählen</div>'; return; }
    const ls = offeneLogs(fid).filter(l => l.datum <= bis).sort((a, b) => a.datum.localeCompare(b.datum)), sp = offeneSpesen(fid).filter(s => s.datum <= bis);
    if (!ls.length && !sp.length) { box.innerHTML = '<div class="empty">Keine offenen verrechenbaren Tätigkeiten oder Spesen</div>'; return; }
    box.innerHTML = `<div class="tablewrap" style="max-height:340px;overflow-y:auto"><table class="t"><thead><tr><th><input type="checkbox" checked data-act="rnAll"></th><th>Datum</th><th>Projekt</th><th>Tätigkeit / Spesen</th><th class="num">Std.</th><th class="num">CHF</th></tr></thead><tbody>
      ${ls.map(l => `<tr><td><input type="checkbox" name="log[]" value="${l.id}" checked data-w="${logWert(l)}" data-m="${l.minuten}"></td><td class="nowrap">${fmt(l.datum)}</td><td>${esc(pName(l.projektId))}</td><td>${esc(l.text)}</td><td class="num">${hm(l.minuten)}</td><td class="num">${chf(logWert(l))}</td></tr>`).join('')}
      ${sp.map(s => `<tr><td><input type="checkbox" name="sp[]" value="${s.id}" checked data-w="${num(s.betrag)}" data-m="0"></td><td class="nowrap">${fmt(s.datum)}</td><td>${esc(pName(s.projektId))}</td><td>Spesen: ${esc(s.text)}</td><td></td><td class="num">${chf(num(s.betrag))}</td></tr>`).join('')}
      </tbody></table></div><div style="text-align:right;margin-top:10px;font-size:15px" id="rnSum"></div>`;
    sum();
  };
  const sum = () => { let w = 0, m = 0; $$('input[name="log[]"]:checked,input[name="sp[]"]:checked', ov).forEach(c => { w += num(c.dataset.w); m += num(c.dataset.m); }); const s = $('#rnSum', ov); if (s) s.innerHTML = `${hm(m)} h · Total ca. <b>CHF ${chf(r05(w))}</b>`; };
  $('#rnFirma', ov).onchange = upd; $('#rnBis', ov).onchange = upd;
  ov.addEventListener('change', e => { if (e.target.dataset.act === 'rnAll') $$('input[name="log[]"],input[name="sp[]"]', ov).forEach(c => c.checked = e.target.checked); sum(); });
  upd();
}
function rechnungEdit(r) {
  modal({
    title: `Rechnung ${r.nr}`, wide: true,
    body: `<div class="frow c4">${fld('Status', `<select name="status">${['offen', 'bezahlt', 'storniert'].map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}${fld('Bezahlt am', inp('bezahltAm', r.bezahltAm || '', 'date'))}${fld('Rechnungsdatum', inp('datum', r.datum, 'date'))}${fld('Fällig', inp('faellig', r.faellig, 'date'))}</div>
      <div class="frow">${fld('Bemerkung', inp('bemerkung', r.bemerkung))}</div>
      <table class="t"><thead><tr><th>Position</th><th class="num">Menge</th><th class="num">Ansatz</th><th class="num">Betrag</th></tr></thead><tbody>${r.positionen.map(p => `<tr><td>${esc(p.text)}<div class="small muted">${esc(p.sub || '')}</div></td><td class="num">${p.menge.toFixed(2)} ${esc(p.einheit)}</td><td class="num">${chf(p.ansatz)}</td><td class="num">${chf(p.betrag)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total CHF</td><td class="num">${chf(r.total)}</td></tr></tfoot></table>
      <p class="small muted">Löschen gibt die Tätigkeiten und Spesen wieder zur Verrechnung frei. Stornieren behält sie als verrechnet.</p>`,
    extra: `<button type="button" class="btn" data-act="pdf" data-id="${r.id}">PDF</button>`,
    onSave: o => { put('rechnungen', { ...r, status: o.status, bezahltAm: o.status === 'bezahlt' ? (o.bezahltAm || today()) : '', datum: o.datum, faellig: o.faellig, bemerkung: o.bemerkung }); },
    onDelete: () => { S.logs.filter(l => l.rechnungId === r.id).forEach(l => put('logs', { ...l, rechnungId: '' })); S.spesen.filter(s => s.rechnungId === r.id).forEach(s => put('spesen', { ...s, rechnungId: '' })); del('rechnungen', r.id); }
  });
}

/* ---------- Swiss QR-Rechnung ---------- */
const ibanClean = s => String(s || '').replace(/\s/g, '').toUpperCase();
function ibanOk(s) { const i = ibanClean(s); if (!/^(CH|LI)\d{7}[A-Z0-9]{12}$/.test(i)) return false; const r = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55); let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97; return m === 1; }
const istQrIban = s => { const iid = +ibanClean(s).slice(4, 9); return iid >= 30000 && iid <= 31999; };
function mod10(s) { const T = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5]; let c = 0; for (const d of s) c = T[(c + +d) % 10]; return String((10 - c) % 10); }
function referenz(r) {
  const base = String(r.nr).replace(/\D/g, '');
  if (istQrIban(S.set.iban)) { const s = base.padStart(26, '0'); return { typ: 'QRR', ref: s + mod10(s) }; }
  const x = (base + 'RF00').replace(/[A-Z]/g, c => c.charCodeAt(0) - 55); let m = 0; for (const ch of x) m = (m * 10 + +ch) % 97;
  return { typ: 'SCOR', ref: 'RF' + String(98 - m).padStart(2, '0') + base };
}
const refFmt = ({ typ, ref }) => typ === 'QRR' ? ref.slice(0, 2) + ' ' + ref.slice(2).replace(/(.{5})/g, '$1 ').trim() : ref.replace(/(.{4})/g, '$1 ').trim();
function qrPayload(r, rf) {
  const s = S.set, e = r.empfaenger || {}, cut = (v, n) => String(v || '').slice(0, n);
  return ['SPC', '0200', '1', ibanClean(s.iban), 'S', cut(s.firma || s.name, 70), cut(s.strasse, 70), cut(s.nr, 16), cut(s.plz, 16), cut(s.ort, 35), s.land || 'CH',
    '', '', '', '', '', '', '', num(r.total).toFixed(2), 'CHF',
    'S', cut(e.name, 70), cut(e.strasse, 70), cut(e.nr, 16), cut(e.plz, 16), cut(e.ort, 35), e.land || 'CH',
    rf.typ, rf.ref, cut(`${r.bemerkung ? r.bemerkung + ' / ' : ''}Rechnung ${r.nr}`, 140), 'EPD'].join('\r\n');
}
function qrTeil(doc, r) {
  const s = S.set, y0 = 192, rf = referenz(r), e = r.empfaenger || {};
  const iban = ibanClean(s.iban).replace(/(.{4})/g, '$1 ').trim();
  const kred = [iban, s.firma || s.name, ...adrZeilen(s)], debi = [e.name, ...adrZeilen(e)];
  doc.setLineDashPattern([1, 1], 0); doc.setDrawColor(0); doc.setLineWidth(0.2);
  doc.line(0, y0, 210, y0); doc.line(62, y0, 62, 297); doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text('Vor der Einzahlung abzutrennen', 105, y0 - 1.5, { align: 'center' });
  const blk = (x, y, head, lines, hs, vs, lh) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(hs); doc.text(head, x, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(vs); lines.filter(Boolean).forEach((l, i) => doc.text(String(l), x, y + lh * (i + 1))); return y + lh * (lines.filter(Boolean).length + 1) + 2; };
  // Empfangsschein
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Empfangsschein', 5, y0 + 9);
  let y = blk(5, y0 + 16, 'Konto / Zahlbar an', kred, 6, 8, 3.5);
  y = blk(5, y, 'Referenz', [refFmt(rf)], 6, 8, 3.5);
  blk(5, y, 'Zahlbar durch', debi, 6, 8, 3.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.text('Währung', 5, y0 + 68); doc.text('Betrag', 20, y0 + 68);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('CHF', 5, y0 + 72); doc.text(tsd(r.total, ' '), 20, y0 + 72);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.text('Annahmestelle', 57, y0 + 82, { align: 'right' });
  // Zahlteil
  doc.setFontSize(11); doc.text('Zahlteil', 67, y0 + 9);
  const q = qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(qrPayload(r, rf))), 'Byte'); q.make();
  const n = q.getModuleCount(), sz = 46, c = sz / n, qx = 67, qy = y0 + 17;
  doc.setFillColor(0, 0, 0);
  for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) if (q.isDark(rr, cc)) doc.rect(qx + cc * c, qy + rr * c, c + 0.01, c + 0.01, 'F');
  const mx = qx + sz / 2, my = qy + sz / 2;
  doc.setFillColor(255, 255, 255); doc.rect(mx - 3.9, my - 3.9, 7.8, 7.8, 'F');
  doc.setFillColor(0, 0, 0); doc.rect(mx - 3.5, my - 3.5, 7, 7, 'F');
  doc.setFillColor(255, 255, 255); doc.rect(mx - 0.7, my - 2.3, 1.4, 4.6, 'F'); doc.rect(mx - 2.3, my - 0.7, 4.6, 1.4, 'F');
  doc.setFillColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('Währung', 67, y0 + 68); doc.text('Betrag', 87, y0 + 68);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('CHF', 67, y0 + 73); doc.text(tsd(r.total, ' '), 87, y0 + 73);
  y = blk(118, y0 + 9, 'Konto / Zahlbar an', kred, 8, 10, 4.2);
  y = blk(118, y, 'Referenz', [refFmt(rf)], 8, 10, 4.2);
  y = blk(118, y, 'Zusätzliche Informationen', doc.splitTextToSize(`${r.bemerkung ? r.bemerkung + ' / ' : ''}Rechnung ${r.nr}`, 85), 8, 10, 4.2);
  blk(118, y, 'Zahlbar durch', debi, 8, 10, 4.2);
}
function rechnungPdf(r) {
  const s = S.set, { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }), L = 20;
  const qrOk = ibanOk(s.iban) && s.strasse && s.plz && s.ort && (r.empfaenger || {}).plz;
  // Kopf
  let y = 18;
  if (s.logo) { try { const p = doc.getImageProperties(s.logo); const h = 16, w = Math.min(60, p.width / p.height * h); doc.addImage(s.logo, 'PNG', L, y, w, w / (p.width / p.height)); y += 20; } catch (e) { } }
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(30, 77, 43); doc.text(s.firma || 'Datenscheune', L, y + 6); doc.setTextColor(0); y += 12; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  [s.name !== s.firma ? s.name : '', ...adrZeilen(s), s.email, s.tel, s.web].filter(Boolean).forEach((l, i) => doc.text(l, L, y + i * 4.2));
  doc.setTextColor(0);
  // Empfänger (Fenster rechts)
  const e = r.empfaenger || {};
  doc.setFontSize(7); doc.setTextColor(110); doc.text([s.firma || s.name, ...adrZeilen(s)].filter(Boolean).join(', '), 118, 47); doc.setTextColor(0);
  doc.setFontSize(10.5); [e.name, ...adrZeilen(e), e.land && e.land !== 'CH' ? e.land : ''].filter(Boolean).forEach((l, i) => doc.text(l, 118, 53 + i * 5));
  // Titel
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('Rechnung', L, 95);
  doc.setFontSize(9.5); const meta = [['Rechnungsnummer', r.nr], ['Rechnungsdatum', fmt(r.datum)], ['Zahlbar bis', fmt(r.faellig)], ...(r.bemerkung ? [['Betreff', r.bemerkung]] : [])];
  meta.forEach(([k, v], i) => { doc.setFont('helvetica', 'normal'); doc.setTextColor(90); doc.text(k, L, 103 + i * 5); doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.text(String(v), L + 35, 103 + i * 5); });
  doc.autoTable({
    startY: 103 + meta.length * 5 + 4, margin: { left: L, right: L }, theme: 'plain',
    head: [['Leistung', 'Menge', 'Einheit', 'Ansatz CHF', 'Betrag CHF']],
    body: r.positionen.map(p => [{ content: p.text + (p.sub ? '\n' + p.sub : '') }, p.menge.toFixed(2), p.einheit, chf(p.ansatz), chf(p.betrag)]),
    foot: [[{ content: 'Total CHF', colSpan: 4 }, chf(r.total)]],
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 2.2, bottom: 2.2, left: 1.5, right: 1.5 } },
    headStyles: { fontStyle: 'bold', textColor: [90, 90, 90], lineWidth: { bottom: 0.3 }, lineColor: [30, 77, 43] },
    footStyles: { fontStyle: 'bold', fontSize: 10.5, lineWidth: { top: 0.3 }, lineColor: [30, 77, 43] },
    columnStyles: { 1: { halign: 'right', cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { halign: 'right', cellWidth: 26 }, 4: { halign: 'right', cellWidth: 28 } },
    didParseCell: d => { if (d.section !== 'body') { if (d.column.index >= 3 || d.column.index === 1) d.cell.styles.halign = 'right'; } }
  });
  let fy = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  const ft = doc.splitTextToSize(s.fusstext || '', 170); doc.text(ft, L, fy); fy += ft.length * 4.5;
  let qrPage = 0;
  if (qrOk) { if (fy > 185) doc.addPage(); qrTeil(doc, r); qrPage = doc.getNumberOfPages(); }
  else { doc.setTextColor(163, 49, 42); doc.text('QR-Zahlteil fehlt: IBAN/Adresse in Einstellungen bzw. Adresse der Firma ergänzen.', L, fy + 4); doc.setTextColor(0); }
  // Rapport
  if ((r.rapport || []).length) {
    doc.addPage(); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Rapport', L, 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90); doc.text(`Beilage zu Rechnung ${r.nr} · ${e.name || ''}`, L, 28); doc.setTextColor(0);
    const tot = sumMin(r.rapport);
    doc.autoTable({
      startY: 34, margin: { left: L, right: L }, theme: 'plain',
      head: [['Datum', 'Projekt', 'Tätigkeit', 'Std.']],
      body: r.rapport.map(x => [fmt(x.datum), x.projekt, x.text + ((x.tags || []).length ? `\n${x.tags.join(', ')}` : ''), hdec(x.minuten)]),
      foot: [[{ content: 'Total Stunden', colSpan: 3 }, hdec(tot)]],
      styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 1.5, right: 1.5 } },
      headStyles: { fontStyle: 'bold', textColor: [90, 90, 90], lineWidth: { bottom: 0.3 }, lineColor: [30, 77, 43] },
      footStyles: { fontStyle: 'bold', lineWidth: { top: 0.3 }, lineColor: [30, 77, 43] },
      alternateRowStyles: { fillColor: [247, 246, 241] },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 40 }, 3: { halign: 'right', cellWidth: 16 } },
      didParseCell: d => { if (d.section !== 'body' && d.column.index === 3) d.cell.styles.halign = 'right'; }
    });
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140); if (i !== qrPage) doc.text(`${s.firma || ''} · Rechnung ${r.nr} · Seite ${i}/${pages}`, 105, 290, { align: 'center' }); doc.setTextColor(0); }
  doc.save(`Rechnung_${r.nr}_${(e.name || '').replace(/[^\wäöüÄÖÜ-]+/g, '_')}.pdf`);
}

/* ---------- Einstellungen ---------- */
function vEinstellungen() {
  const s = S.set, ib = s.iban ? (ibanOk(s.iban) ? `<span class="b green">gültig${istQrIban(s.iban) ? ' · QR-IBAN (QR-Referenz)' : ' · IBAN (SCOR-Referenz)'}</span>` : '<span class="b red">ungültig</span>') : '';
  return `<div class="head"><h1>Einstellungen</h1></div>
  <form class="card" data-form="settings"><h2>Eigene Angaben (Rechnungssteller)</h2>
    <div class="frow c2">${fld('Firmenname', inp('firma', s.firma))}${fld('Name', inp('name', s.name))}</div>
    <div class="frow c4">${fld('Strasse', inp('strasse', s.strasse))}${fld('Nr.', inp('nr', s.nr))}${fld('PLZ', inp('plz', s.plz))}${fld('Ort', inp('ort', s.ort))}</div>
    <div class="frow c3">${fld('E-Mail', inp('email', s.email, 'email'))}${fld('Telefon', inp('tel', s.tel, 'tel'))}${fld('Web', inp('web', s.web))}</div>
    <h2 style="margin-top:16px">Zahlung &amp; Rechnung</h2>
    <div class="frow c2">${fld(`IBAN / QR-IBAN ${ib}`, inp('iban', s.iban, 'text', 'placeholder="CH.. .... .... .... .... ."'))}${fld('Zahlungsfrist Standard (Tage)', inp('frist', s.frist, 'number', 'min="0"'))}</div>
    <div class="frow">${fld('Fusstext Rechnung', `<textarea name="fusstext" rows="3">${esc(s.fusstext)}</textarea>`)}</div>
    <div class="frow c2">${fld('MWST-Grenze CHF', inp('mwstGrenze', s.mwstGrenze, 'number'))}${fld('Timer runden auf Minuten (0 = nicht runden)', inp('rundung', s.rundung, 'number', 'min="0"'))}</div>
    <div class="frow">${fld('Logo (PNG/JPG, erscheint auf Rechnung)', `<input type="file" accept="image/png,image/jpeg" data-act="logo">`)}</div>
    ${s.logo ? `<div class="btns" style="align-items:center;margin-bottom:10px"><img src="${s.logo}" style="max-height:50px;max-width:200px"><button type="button" class="btn sm danger" data-act="logoDel">Logo entfernen</button></div>` : ''}
    <button class="btn pri">Speichern</button></form>
  <div class="card"><h2>Daten &amp; Konto</h2><p class="small muted">Speicherort: <b>${mode === 'firebase' ? 'Firebase (synchronisiert) · ' + esc(USER && USER.email) : 'nur dieser Browser (Firebase nicht eingerichtet)'}</b> · Version ${VERSION}</p>
    <div class="btns"><button class="btn" data-act="backup">Backup herunterladen (JSON)</button><label class="btn">Backup einlesen<input type="file" accept="application/json" data-act="restore" class="hidden"></label>${mode === 'firebase' ? '<button class="btn" data-act="logout">Abmelden</button>' : ''}</div></div>`;
}
function logoLaden(file) {
  const rd = new FileReader(); rd.onload = () => { const img = new Image(); img.onload = () => { const sc = Math.min(1, 500 / img.width), c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); saveSet({ logo: c.toDataURL('image/png') }); toast('Logo gespeichert'); }; img.src = rd.result; }; rd.readAsDataURL(file);
}
function backup() { const d = { version: VERSION, exportiert: new Date().toISOString(), set: S.set }; COLLS.forEach(c => d[c] = S[c]); download(JSON.stringify(d, null, 1), `datenscheune_backup_${today()}.json`, 'application/json'); }
function restore(file) {
  const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(rd.result); if (!confirm('Backup einlesen? Bestehende Einträge mit gleicher ID werden überschrieben.')) return; COLLS.forEach(c => (d[c] || []).forEach(o => W.put(c, o))); if (d.set) W.setSettings({ ...DEF, ...d.set }); toast('Backup eingelesen'); } catch (e) { toast('Ungültige Datei'); } }; rd.readAsText(file);
}

/* ---------- Aktionen ---------- */
document.addEventListener('click', e => {
  const tr = e.target.closest('[data-href]'); if (tr && !e.target.closest('button,a,input')) { location.hash = tr.dataset.href; return; }
  const b = e.target.closest('[data-act],[data-tagadd],[data-tagdel]'); if (!b) return;
  if (b.dataset.tagadd) { e.preventDefault(); const v = b.dataset.tagadd; tagSet(b.closest('[data-tagin]'), s => s.includes(v) ? s : [...s, v]); return; }
  if (b.dataset.tagdel) { e.preventDefault(); const v = b.dataset.tagdel; tagSet(b.closest('[data-tagin]'), s => s.filter(x => x !== v)); return; }
  const a = b.dataset.act, id = b.dataset.id;
  if (b.tagName === 'INPUT' && b.type === 'file') return;
  const A = {
    logNeu: () => logModal({ projektId: UI.qa.projektId }),
    logNeuP: () => logModal({ projektId: id }),
    logEdit: () => logModal(S.logs.find(l => l.id === id)),
    timerStart: () => timerStart(), timerStartQA: () => timerStart(), timerStartP: () => timerStart(id), timerStop,
    csv: csvExport,
    alleMonate: () => { UI.logMonat = UI.logMonat ? '' : today().slice(0, 7); schedule(); },
    firmaNeu: () => firmaModal(), firmaEdit: () => firmaModal(firma(id)),
    kAdd: () => $('#krows').insertAdjacentHTML('beforeend', kRow()), kDel: () => b.closest('.krow').remove(),
    projektNeu: () => projektModal({ firmaId: b.dataset.firma || '' }), projektEdit: () => projektModal(projekt(id)),
    pStatus: () => { UI.pStatus = b.dataset.v; schedule(); }, rStatus: () => { UI.rStatus = b.dataset.v; schedule(); },
    todoToggle: () => pListe(b.dataset.p, 'todos', l => l.map(t => t.id === b.dataset.t ? { ...t, erledigt: !t.erledigt, erledigtAm: !t.erledigt ? today() : '' } : t)),
    todoDel: () => pListe(b.dataset.p, 'todos', l => l.filter(t => t.id !== b.dataset.t)),
    linkDel: () => pListe(b.dataset.p, 'links', l => l.filter(t => t.id !== b.dataset.t)),
    notizDel: () => { if (confirm('Notiz löschen?')) pListe(b.dataset.p, 'notizen', l => l.filter(t => t.id !== b.dataset.t)); },
    spesenNeu: () => spesenModal(), spesenEdit: () => spesenModal(S.spesen.find(s => s.id === id)),
    rechnungNeu: () => rechnungNeu(b.dataset.firma || ''),
    rechnungEdit: () => rechnungEdit(S.rechnungen.find(r => r.id === id)),
    pdf: () => { e.stopPropagation(); rechnungPdf(S.rechnungen.find(r => r.id === id)); },
    logoDel: () => saveSet({ logo: '' }),
    backup, logout: () => AUTH && AUTH.A.signOut(AUTH.auth).then(() => location.reload())
  };
  if (A[a]) { if (b.tagName !== 'INPUT') e.preventDefault(); A[a](); }
});
document.addEventListener('change', e => {
  const t = e.target; if (t.type !== 'file' || !t.files[0]) return;
  if (t.dataset.act === 'logo') logoLaden(t.files[0]);
  if (t.dataset.act === 'restore') restore(t.files[0]);
  t.value = '';
});
document.addEventListener('submit', e => {
  const f = e.target; if (f.closest('.ov')) return; e.preventDefault();
  if (f.id === 'quick') return quickSave(f);
  const o = Object.fromEntries(new FormData(f)), pid = f.dataset.p;
  if (f.dataset.form === 'todoAdd' && o.text.trim()) pListe(pid, 'todos', l => [...l, { id: uid(), text: o.text.trim(), faellig: o.faellig || '', erledigt: false }]);
  if (f.dataset.form === 'linkAdd' && o.url.trim()) pListe(pid, 'links', l => [...l, { id: uid(), titel: o.titel.trim(), url: /^https?:\/\//.test(o.url.trim()) ? o.url.trim() : 'https://' + o.url.trim() }]);
  if (f.dataset.form === 'notizAdd' && o.text.trim()) pListe(pid, 'notizen', l => [...l, { id: uid(), datum: o.datum || today(), text: o.text.trim() }]);
  if (f.dataset.form === 'settings') { const { logo, ...rest } = o; saveSet({ ...rest, iban: ibanClean(o.iban), frist: num(o.frist), mwstGrenze: num(o.mwstGrenze), rundung: num(o.rundung) }); toast('Gespeichert'); }
  document.activeElement && document.activeElement.blur(); schedule();
});
document.addEventListener('keydown', e => { if (e.key === 'n' && e.altKey) { e.preventDefault(); logModal({ projektId: UI.qa.projektId }); } });

/* ---------- Start ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
if (window.DS_FIREBASE && window.DS_FIREBASE.apiKey) initFirebase(window.DS_FIREBASE).catch(e => { console.error(e); loginScreen('Firebase-Fehler: ' + e.message); });
else initLocal();
