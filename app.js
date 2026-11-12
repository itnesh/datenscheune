// Datenscheune - Zeiterfassung, Projekte, Rechnungen. Daten lokal oder in Firestore (datenscheune/main/...).
const VERSION = '0.9.1';

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
const STATUS = ['Backlog', 'To-do', 'In Arbeit', 'On hold', 'Done'];
const STC = { Backlog: '', 'To-do': 'blue', 'In Arbeit': 'green', 'On hold': 'warn', Done: 'done' };
const ALT_STATUS = { Offen: 'In Arbeit', Abgeschlossen: 'Done', Idee: 'Backlog', Offeriert: 'To-do', Aktiv: 'In Arbeit', Pausiert: 'On hold' };
const IC = {
  edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};
const icBtn = (ic, act, attrs = '', title = '') => `<button class="icb" data-act="${act}" ${attrs} title="${title}" aria-label="${title}">${IC[ic]}</button>`;
const addOpen = k => !!UI.open[k];
const cardHead = (title, k) => `<div class="ch"><h2>${title}</h2><button class="icb ${addOpen(k) ? 'on' : ''}" data-act="toggleAdd" data-k="${k}" title="${addOpen(k) ? 'Schliessen' : 'Hinzufügen'}" aria-label="Hinzufügen">${IC.plus}</button></div>`;
const addForm = (k, html) => addOpen(k) ? `<div class="addbox">${html}</div>` : '';
const logoImg = (f, sz = 40) => f && f.logo ? `<img class="flogo" src="${f.logo}" alt="" style="width:${sz}px;height:${sz}px">` : '';

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
  schedule();
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
    const ps = S.projekte.filter(p => p.firmaId === f.id && (!nurAktiv || p.status !== 'Done' || p.id === sel)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return ps.length ? `<optgroup label="${esc(f.name)}">${ps.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}
const firmaOptions = (sel, leer = '- Firma wählen -') => `<option value="">${leer}</option>` + sortFirmen().filter(f => !f.archiv || f.id === sel).map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
const adrZeilen = o => [o.strasse ? `${o.strasse}${o.nr ? ' ' + o.nr : ''}` : '', [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean);

function migrieren() {
  if (!S.loaded.projekte) return;
  S.projekte.filter(p => !STATUS.includes(p.status)).forEach(p => put('projekte', { ...p, status: ALT_STATUS[p.status] || 'In Arbeit' }));
}

/* ---------- Router ---------- */
let rq = false;
function schedule() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); }
const UI = { logMonat: today().slice(0, 7), logFirma: '', logProjekt: '', logTag: '', logStatus: '', qa: { datum: today(), projektId: '', text: '', dauer: '', tags: '[]', verrechenbar: true }, pStatus: 'aktiv', anteilN: 1, pFirma: '', open: {}, rStatus: '', spJahr: String(new Date().getFullYear()) };

function render() {
  if (mode === 'firebase' && !USER) return;
  const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const ae = document.activeElement, navi = h !== render.last; render.last = h; if (navi) { UI.open = {}; UI.anteilN = 1; }
  let keep = null;
  if (!navi && ae && $('#view').contains(ae) && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && /^(text|number|email|tel|url|date)$/.test(ae.type)))) {
    const inl = ae.dataset.ff ? `[data-ff="${ae.dataset.ff}"]` : ae.dataset.pf ? `[data-pf="${ae.dataset.pf}"]` : null;
    if (!inl) { ae.addEventListener('blur', schedule, { once: true }); return; }
    keep = { sel: inl, v: ae.value, a: ae.selectionStart, b: ae.selectionEnd };
  }
  const [tab, id] = h.split('/');
  const V = { dashboard: vDashboard, logs: vLogs, projekte: vProjekte, projekt: vProjekt, firmen: vFirmen, firma: vFirma, spesen: vSpesen, rechnungen: vRechnungen, einstellungen: vEinstellungen }[tab] || vDashboard;
  const navTab = { projekt: 'projekte', firma: 'firmen' }[tab] || tab;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === navTab));
  migrieren();
  const keepF = navi ? [] : $$('#view .addbox [name]').map(el => { const fm = el.closest('form'); return { fm: fm.dataset.form, nm: el.name, i: $$(`[name="${el.name}"]`, fm).indexOf(el), v: el.type === 'checkbox' ? el.checked : el.value, cb: el.type === 'checkbox' }; });
  $('#view').innerHTML = V(id);
  keepF.forEach(x => { const fe = $(`#view form[data-form="${x.fm}"]`); const el = fe && $$(`[name="${x.nm}"]`, fe)[x.i]; if (!el) return; if (x.cb) el.checked = x.v; else el.value = x.v; if (el.type === 'hidden' && el.closest('[data-tagin]')) tagRefresh(el.closest('[data-tagin]')); if (el.dataset.act === 'personWahl') { const fr = $('.pfrei', el.closest('form')); fr && fr.classList.toggle('hidden', el.value !== '__neu'); } });
  if (keep) { const el = $(keep.sel, $('#view')); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.a, keep.b); } catch (e) { } } }
}
window.addEventListener('hashchange', schedule);

/* ---------- Tag-Eingabe ---------- */
function tagInput(name, sel = [], qa = false) {
  return `<div class="tagin" data-tagin><input type="hidden" name="${name}" value='${esc(JSON.stringify(sel))}' ${qa ? `data-qa="${name}"` : ''}>${tagInner(sel, '')}</div>`;
}
function tagInner(sel, q) {
  const sugg = allTags().filter(t => !sel.includes(t) && (!q || t.toLowerCase().includes(q.toLowerCase()))).slice(0, 12);
  return `${sel.map(t => `<span class="tag">${esc(t)}<button type="button" data-tagdel="${esc(t)}" aria-label="entfernen">×</button></span>`).join('')}<input class="tagtxt" type="text" placeholder="${sel.length ? '' : 'Tag eingeben, Enter'}" value="${esc(q)}"><div class="sugg">${sugg.map(t => `<button type="button" class="tag" data-tagadd="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
}
function tagRefresh(box) { const h = $('input[type=hidden]', box); let sel = []; try { sel = JSON.parse(h.value || '[]'); } catch (e) { } [...box.children].forEach(c => { if (c !== h) c.remove(); }); box.insertAdjacentHTML('beforeend', tagInner(sel, '')); }
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
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset || !t.dataset.ff) return; const f = firma(t.dataset.f); if (!f) return;
  const k = t.dataset.ff, v = k === 'archiv' ? t.checked : k === 'ansatz' ? num(t.value) : k === 'land' ? (t.value.trim().toUpperCase() || 'CH') : t.value.trim();
  if (k === 'name' && !v) { toast('Firmenname darf nicht leer sein'); t.value = f.name; return; }
  put('firmen', { ...f, [k]: v }); toast('Gespeichert');
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset || !t.dataset.pf) return; const p = projekt(t.dataset.p); if (!p) return;
  const k = t.dataset.pf, v = k === 'ansatz' ? num(t.value) : t.value.trim();
  if (k === 'name' && !v) { toast('Projektname darf nicht leer sein'); t.value = p.name; return; }
  if (k === 'firmaId' && !v) { t.value = p.firmaId; return; }
  put('projekte', { ...p, [k]: v, ...(k === 'firmaId' ? { personen: [] } : {}) }); toast('Gespeichert');
});
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.ui) { UI[t.dataset.ui] = t.value; schedule(); } if (t.dataset && t.dataset.qa && t.type === 'checkbox') UI.qa[t.dataset.qa] = t.checked; });
// Tags beim Verlassen übernehmen (falls nicht mit Enter bestätigt)
document.addEventListener('focusout', e => { const t = e.target; if (t.classList && t.classList.contains('tagtxt') && t.value.trim()) { const box = t.closest('[data-tagin]'); const v = t.value.trim(); setTimeout(() => { if (!box.contains(document.activeElement)) { const h = $('input[type=hidden]', box); let s = JSON.parse(h.value || '[]'); if (!s.includes(v)) s.push(v); h.value = JSON.stringify(s); h.dispatchEvent(new Event('input', { bubbles: true })); t.value = ''; } }, 120); } });

/* ---------- Modal ---------- */
function modal({ title, body, onSave, onDelete, wide, saveTxt = 'Speichern', extra = '' }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate><header><button type="button" class="back-pill" data-x><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>Zurück</button><h2>${esc(title)}</h2><button type="button" class="xrund" data-x aria-label="Schliessen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header><div class="body">${body}</div><footer>${onDelete ? '<button type="button" class="btn danger" data-del>Löschen</button>' : ''}${extra}<span class="sp"></span><button type="button" class="btn" data-x>Abbrechen</button>${onSave ? `<button class="btn pri" type="submit">${esc(saveTxt)}</button>` : ''}</footer></form>`;
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
  const todos = []; S.projekte.filter(p => p.status !== 'Done').forEach(p => (p.todos || []).filter(t => !t.erledigt).forEach(t => todos.push({ p, t })));
  todos.sort((a, b) => (a.t.faellig || '9999') < (b.t.faellig || '9999') ? -1 : 1);
  const aktiv = S.projekte.filter(p => p.status !== 'Done').sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status) || a.name.localeCompare(b.name, 'de'));
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
    <div class="card"><h2>Aktive Projekte</h2>${aktiv.length ? `<div class="list">${aktiv.map(p => { const ol = offeneLogs().filter(l => l.projektId === p.id); return `<a class="li" href="#/projekt/${p.id}" style="text-decoration:none;color:inherit"><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(fName(p.firmaId))}</div></div><span class="small muted" style="margin-right:6px">${hm(sumMin(ol))} h offen</span><span class="b ${STC[p.status] || ''}">${esc(p.status)}</span></a>`; }).join('')}</div>` : '<div class="empty">Keine aktiven Projekte</div>'}</div>
  </div>
  <div class="card"><h2>Zuletzt erfasst</h2>${logTable(letzte, false)}</div>`;
}

/* ---------- Zeiterfassung ---------- */
function logTable(ls, gruppiert = true) {
  if (!ls.length) return '<div class="empty">Keine Einträge</div>';
  ls = [...ls].sort((a, b) => b.datum.localeCompare(a.datum) || (b.geaendert || 0) - (a.geaendert || 0));
  let last = '', rows = '';
  for (const l of ls) {
    if (gruppiert && l.datum !== last) { last = l.datum; const tm = sumMin(ls.filter(x => x.datum === l.datum)); rows += `<tr class="day"><td colspan="3">${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][pd(l.datum).getDay()]}, ${fmt(l.datum)}</td><td class="num">${hm(tm)}</td><td></td></tr>`; }
    const p = projekt(l.projektId);
    const st = l.rechnungId ? '<span class="b blue">verrechnet</span>' : l.verrechenbar === false ? '<span class="b">intern</span>' : '<span class="b green">offen</span>';
    rows += `<tr class="click" data-act="logEdit" data-id="${l.id}">${gruppiert ? '' : `<td class="nowrap">${fmt(l.datum)}</td>`}<td>${p ? `<b>${esc(p.name)}</b><div class="small muted">${esc(fName(p.firmaId))}</div>` : '<span class="muted">-</span>'}</td><td>${l.notizId ? `<span class="muted" title="Mit Protokoll verknüpft">${logNotizIc(l)}</span> ` : ''}${esc(l.text)}</td>${gruppiert ? '<td></td>' : ''}<td class="num">${hm(l.minuten)}</td><td class="num">${st}</td></tr>`;
  }
  return `<div class="tablewrap"><table class="t"><thead><tr>${gruppiert ? '' : '<th>Datum</th>'}<th>Projekt</th><th>Tätigkeit</th>${gruppiert ? '<th></th>' : ''}<th class="num">Dauer</th><th class="num">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function logNotizIc(l) { for (const p of S.projekte) { const n = (p.notizen || []).find(x => x.id === l.notizId); if (n) return NTYP[notizTyp(n)].replace('width="18" height="18"', 'width="14" height="14" style="vertical-align:-2px"'); } return ''; }
function logFilter() {
  return S.logs.filter(l => (!UI.logMonat || (l.datum || '').startsWith(UI.logMonat)) && (!UI.logFirma || logFirma(l) === UI.logFirma) && (!UI.logProjekt || l.projektId === UI.logProjekt)
    && (!UI.logStatus || (UI.logStatus === 'offen' ? !l.rechnungId && l.verrechenbar !== false : UI.logStatus === 'verrechnet' ? !!l.rechnungId : l.verrechenbar === false)));
}
function vLogs() {
  const q = UI.qa, ls = logFilter(), tot = sumMin(ls), ver = sumMin(ls.filter(l => l.verrechenbar !== false)), wert = ls.reduce((a, l) => a + logWert(l), 0);
  return `<div class="head"><h1>Zeiterfassung</h1><button class="btn" data-act="csv">CSV-Export</button></div>
  <div class="card">${cardHead('Neue Tätigkeit', 'quick')}${addForm('quick', `<form id="quick" autocomplete="off"><div class="quick">
    ${fld('Datum', `<input type="date" name="datum" data-qa="datum" value="${esc(q.datum)}">`)}
    ${fld('Projekt', `<select name="projektId" data-qa="projektId">${projektOptions(q.projektId)}</select>`)}
    ${fld('Tätigkeit', `<input type="text" name="text" data-qa="text" value="${esc(q.text)}" placeholder="Was hast du gemacht?">`)}
    ${fld('Dauer', `<input type="text" name="dauer" data-qa="dauer" value="${esc(q.dauer)}" placeholder="1:30">`)}
    <label class="chk" style="padding-bottom:10px"><input type="checkbox" name="verrechenbar" data-qa="verrechenbar" ${q.verrechenbar ? 'checked' : ''}>verrechenbar</label>
    <button class="btn pri" type="submit" style="height:38px">Erfassen</button>
  </div><div class="small muted" style="margin-top:6px">Dauer: 1:30 oder 1.5 (Stunden) oder 45m (Minuten)</div></form>`)}</div>
  <div class="filters">
    ${fld('Monat', `<input type="month" data-ui="logMonat" value="${esc(UI.logMonat)}">`)}
    ${fld('Firma', `<select data-ui="logFirma">${firmaOptions(UI.logFirma, 'Alle Firmen')}</select>`)}
    ${fld('Projekt', `<select data-ui="logProjekt">${projektOptions(UI.logProjekt, false).replace('- Projekt wählen -', 'Alle Projekte')}</select>`)}
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
    body: `${l.notizId ? `<div class="small muted" style="margin-bottom:8px">${CLOCK} Verknüpft mit Protokoll im Projekt. Titel und Datum werden dort mitgeändert.</div>` : ''}${l.rechnungId ? `<div class="note" style="margin-bottom:10px">Bereits verrechnet (Rechnung ${esc((S.rechnungen.find(r => r.id === l.rechnungId) || {}).nr || '')}). Änderungen wirken nicht auf die Rechnung.</div>` : ''}
      <div class="frow c2">${fld('Datum', inp('datum', l.datum || today(), 'date'))}${fld('Dauer', inp('dauer', l.minuten ? hm(l.minuten) : '', 'text', 'placeholder="1:30"'))}</div>
      <div class="frow">${fld('Projekt', `<select name="projektId">${projektOptions(l.projektId || '')}</select>`)}</div>
      <div class="frow">${fld('Tätigkeit', `<textarea name="text" rows="3">${esc(l.text || '')}</textarea>`)}</div>
      <label class="chk"><input type="checkbox" name="verrechenbar" ${l.verrechenbar !== false ? 'checked' : ''}>verrechenbar</label>`,
    onSave: o => {
      const min = parseDauer(o.dauer); if (!min) { toast('Dauer fehlt oder ungültig'); return false; }
      if (!o.projektId) { toast('Projekt wählen'); return false; }
      put('logs', { ...l, datum: o.datum || today(), projektId: o.projektId, text: o.text, minuten: min, verrechenbar: o.verrechenbar });
      if (l.notizId) notizSync(l, n => ({ ...n, titel: o.text, datum: o.datum || n.datum }));
      after && after(); toast('Gespeichert');
    },
    onDelete: neu ? null : () => { if (l.rechnungId) { toast('Verrechnete Tätigkeit: zuerst Rechnung löschen'); return; } del('logs', l.id); if (l.notizId) notizSync(l, n => ({ ...n, logId: n.logId === l.id ? '' : n.logId || '', anteile: (n.anteile || []).map(a => a.logId === l.id ? { ...a, logId: '' } : a) })); }
  });
}
function notizSync(l, fn) { const p = S.projekte.find(x => (x.notizen || []).some(n => n.id === l.notizId)); if (p) pListe(p.id, 'notizen', ns => ns.map(n => n.id === l.notizId ? fn(n) : n)); }
function quickSave(form) {
  const o = Object.fromEntries(new FormData(form)); const min = parseDauer(o.dauer);
  if (!o.projektId) return toast('Projekt wählen');
  if (!min) return toast('Dauer fehlt oder ungültig (z.B. 1:30)');
  put('logs', { datum: o.datum || today(), projektId: o.projektId, text: (o.text || '').trim(), minuten: min, verrechenbar: !!o.verrechenbar });
  UI.qa = { ...UI.qa, text: '', dauer: '' }; UI.open.quick = false; document.activeElement && document.activeElement.blur(); toast('Erfasst'); schedule();
}
function csvExport() {
  const ls = logFilter().sort((a, b) => a.datum.localeCompare(b.datum));
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Firma', 'Projekt', 'Tätigkeit', 'Stunden', 'Ansatz', 'Betrag', 'Verrechenbar', 'Rechnung']].concat(ls.map(l => { const p = projekt(l.projektId); return [fmt(l.datum), p ? fName(p.firmaId) : '', p ? p.name : '', l.text, hdec(l.minuten), ansatz(p), logWert(l).toFixed(2), l.verrechenbar === false ? 'nein' : 'ja', (S.rechnungen.find(r => r.id === l.rechnungId) || {}).nr || '']; }));
  download('﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), `zeiterfassung_${UI.logMonat || 'alle'}.csv`, 'text/csv');
}
function download(data, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------- Firmen ---------- */
function vFirmen() {
  const fs = sortFirmen();
  return `<div class="head"><h1>Firmen</h1><button class="btn pri" data-act="firmaNeu">+ Firma</button></div>
  <div class="card">${fs.length ? `<table class="t"><thead><tr><th>Firma</th><th>Ort</th><th>Ansprechpartner</th><th class="num">Ansatz</th><th class="num">Projekte</th><th class="num">Offen</th></tr></thead><tbody>${fs.map(f => { const ol = offeneLogs(f.id); return `<tr class="click" data-href="#/firma/${f.id}"><td><div style="display:flex;align-items:center;gap:10px">${logoImg(f, 28)}<span><b>${esc(f.name)}</b>${f.archiv ? ' <span class="b">archiviert</span>' : ''}</span></div></td><td>${esc([f.plz, f.ort].filter(Boolean).join(' '))}</td><td>${esc((f.kontakte || []).map(k => k.name).join(', '))}</td><td class="num">${f.ansatz ? 'CHF ' + chf(num(f.ansatz)) : '-'}</td><td class="num">${S.projekte.filter(p => p.firmaId === f.id && p.status !== 'Done').length}</td><td class="num">${hm(sumMin(ol))} h</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">Noch keine Firmen erfasst</div>'}</div>`;
}
function vFirma(id) {
  const f = firma(id); if (!f) return '<div class="empty">Firma nicht gefunden</div>';
  const ps = S.projekte.filter(p => p.firmaId === id), rs = S.rechnungen.filter(r => r.firmaId === id).sort((a, b) => b.datum.localeCompare(a.datum));
  const ol = offeneLogs(id), ow = ol.reduce((a, l) => a + logWert(l), 0) + offeneSpesen(id).reduce((a, s) => a + num(s.betrag), 0);
  const ff = (label, k, type = 'text', attrs = '') => fld(label, `<input type="${type}" data-ff="${k}" data-f="${id}" value="${esc(f[k] ?? '')}" ${attrs}>`);
  return `<div class="head"><label class="logoup" title="Logo hochladen">${f.logo ? logoImg(f, 56) : `<span class="logoph">${IC.plus}<small>Logo</small></span>`}<input type="file" accept="image/png,image/jpeg,image/svg+xml" class="hidden" data-act="firmaLogo" data-f="${id}"></label><h1><a href="#/firmen" class="small" style="text-decoration:none">‹ Firmen</a><br>${esc(f.name)}<span class="sub">${esc(adrZeilen(f).join(', '))}${f.archiv ? ' · <span class="b">archiviert</span>' : ''}</span></h1>${ol.length ? `<button class="btn pri" data-act="rechnungNeu" data-firma="${id}">Rechnung erstellen</button>` : ''}${icBtn('trash', 'firmaDel', `data-id="${id}"`, 'Firma löschen')}</div>
  <div class="card"><h2>Firmendaten</h2>
    <div class="frow" style="grid-template-columns:2fr 1fr 2fr .7fr .8fr 1.4fr .6fr">${ff('Firmenname', 'name')}${ff('Stundensatz CHF', 'ansatz', 'number', 'step="0.05" min="0"')}${ff('Strasse', 'strasse')}${ff('Nr.', 'nr')}${ff('PLZ', 'plz')}${ff('Ort', 'ort')}${ff('Land', 'land', 'text', 'maxlength="2"')}</div>
    <div class="frow">${fld('Notiz', `<textarea data-ff="notiz" data-f="${id}" rows="3">${esc(f.notiz || '')}</textarea>`)}</div>
    <div class="btns" style="align-items:center"><label class="chk"><input type="checkbox" data-ff="archiv" data-f="${id}" ${f.archiv ? 'checked' : ''}>archiviert</label>${f.logo ? '<button class="btn sm danger" data-act="firmaLogoDel" data-id="' + id + '">Logo entfernen</button>' : ''}<span class="small muted">Änderungen werden automatisch gespeichert. Logo: oben links anklicken.</span></div></div>
  <div class="kpis"><div class="kpi"><span>Stundensatz</span><b>${f.ansatz ? 'CHF ' + chf(num(f.ansatz)) : '-'}</b></div><div class="kpi"><span>Nicht verrechnet</span><b>CHF ${chf(ow)}</b><small>${hm(sumMin(ol))} h</small></div><div class="kpi"><span>Verrechnet total</span><b>CHF ${chf(rs.filter(r => r.status !== 'storniert').reduce((a, r) => a + num(r.total), 0))}</b></div></div>
  <div class="grid g2">
    <div class="card">${cardHead('Ansprechpartner', 'kontakt')}${addForm('kontakt', `<form data-form="kontaktAdd" data-f="${id}" autocomplete="off">${personFelder({})}<div style="text-align:right;margin-bottom:8px"><button class="btn pri">Hinzufügen</button></div></form>`)}${(f.kontakte || []).length ? `<div class="list">${f.kontakte.map(k => kontaktLi(k, `data-act="kontaktEdit" data-firma="${id}" data-k="${k.id}"`)).join('')}</div>` : '<div class="empty">Keine Ansprechpartner</div>'}</div>
    <div class="card">${cardHead('Projekte', 'fprojekt')}${addForm('fprojekt', `<form data-form="projektAdd" data-f="${id}" autocomplete="off"><div class="frow" style="grid-template-columns:1fr 150px auto;align-items:end">${fld('Projektname', '<input type="text" name="name">')}${fld('Status', `<select name="status">${STATUS.map(s => `<option>${s}</option>`).join('')}</select>`)}<button class="btn pri">Hinzufügen</button></div></form>`)}${ps.length ? `<div class="list">${ps.map(p => `<a class="li" href="#/projekt/${p.id}" style="text-decoration:none;color:inherit"><div class="grow"><b>${esc(p.name)}</b><div class="small muted">Ansatz CHF ${chf(ansatz(p))}${num(p.ansatz) ? '' : ' (Firma)'}</div></div><span class="b ${STC[p.status] || ''}">${esc(p.status)}</span></a>`).join('')}</div>` : '<div class="empty">Keine Projekte</div>'}</div>
  </div>
  <div class="card"><h2>Rechnungen</h2>${rTable(rs)}</div>`;
}
function kontaktLi(k, attrs, extra = '', rechts = '') {
  return `<div class="li click" ${attrs}><div class="grow"><b>${esc(k.name)}</b>${k.funktion ? ` <span class="muted">· ${esc(k.funktion)}</span>` : ''}${extra}<div class="small">${k.email ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ''}${k.email && k.tel ? ' · ' : ''}${k.tel ? `<a href="tel:${esc(k.tel)}">${esc(k.tel)}</a>` : ''}</div>${k.notiz ? `<div class="small muted" style="white-space:pre-wrap;margin-top:2px">${esc(k.notiz)}</div>` : ''}</div>${rechts}</div>`;
}
const personFelder = (k, firmaFeld = false) => `<div class="frow c2">${fld('Name', inp('name', k.name))}${firmaFeld ? fld('Firma / Organisation', inp('org', k.org)) : fld('Funktion', inp('funktion', k.funktion))}</div>
  ${firmaFeld ? `<div class="frow">${fld('Funktion / Rolle', inp('funktion', k.funktion))}</div>` : ''}
  <div class="frow c2">${fld('E-Mail', inp('email', k.email, 'email'))}${fld('Telefon', inp('tel', k.tel, 'tel'))}</div>
  <div class="frow">${fld('Notizen', `<textarea name="notiz" rows="4">${esc(k.notiz || '')}</textarea>`)}</div>`;
function kontaktModal(firmaId, k = {}) {
  const f = firma(firmaId); if (!f) return;
  modal({
    title: k.id ? 'Ansprechpartner bearbeiten' : 'Neuer Ansprechpartner', body: personFelder(k),
    onSave: o => {
      if (!o.name) { toast('Name fehlt'); return false; }
      const n = { ...k, id: k.id || uid(), name: o.name, funktion: o.funktion, email: o.email, tel: o.tel, notiz: o.notiz };
      const ks = [...(f.kontakte || [])], i = ks.findIndex(x => x.id === n.id); if (i >= 0) ks[i] = n; else ks.push(n);
      put('firmen', { ...f, kontakte: ks });
    },
    onDelete: k.id ? () => put('firmen', { ...f, kontakte: (f.kontakte || []).filter(x => x.id !== k.id) }) : null
  });
}
function bildKlein(file, max, cb) {
  const rd = new FileReader(); rd.onload = () => { const img = new Image(); img.onload = () => { const sc = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/png')); }; img.src = rd.result; }; rd.readAsDataURL(file);
}
function firmaModal(f = {}) {
  const ov = modal({
    title: f.id ? 'Firma bearbeiten' : 'Neue Firma', wide: true,
    body: `<div class="frow c2">${fld('Firmenname', inp('name', f.name))}${fld('Stundensatz CHF (Standard)', inp('ansatz', f.ansatz || '', 'number', 'step="0.05" min="0"'))}</div>
      <div class="frow c4">${fld('Strasse', inp('strasse', f.strasse))}${fld('Nr.', inp('nr', f.nr))}${fld('PLZ', inp('plz', f.plz))}${fld('Ort', inp('ort', f.ort))}</div>
      <div class="frow c4">${fld('Land', inp('land', f.land || 'CH', 'text', 'maxlength="2"'))}${fld('Web', inp('web', f.web))}</div>
      <div class="frow">${fld('Firmenlogo (PNG/JPG)', `<input type="file" accept="image/png,image/jpeg,image/svg+xml" id="fmLogoFile"><input type="hidden" name="logo" id="fmLogo" value="${esc(f.logo || '')}">`)}</div>
      <div class="btns" id="fmLogoPrev" style="align-items:center;margin:-2px 0 10px">${f.logo ? `<img src="${f.logo}" class="flogo" style="width:56px;height:56px"><button type="button" class="btn sm danger" id="fmLogoDel">Logo entfernen</button>` : ''}</div>
      <div class="frow">${fld('Notiz', `<textarea name="notiz" rows="3">${esc(f.notiz || '')}</textarea>`)}</div>
      ${f.id ? `<label class="chk"><input type="checkbox" name="archiv" ${f.archiv ? 'checked' : ''}>archiviert</label>` : ''}`,
    onSave: o => {
      if (!o.name) { toast('Firmenname fehlt'); return false; }
      const x = put('firmen', { kontakte: [], ...f, name: o.name, ansatz: num(o.ansatz), strasse: o.strasse, nr: o.nr, plz: o.plz, ort: o.ort, land: (o.land || 'CH').toUpperCase(), web: o.web, logo: o.logo || '', notiz: o.notiz, archiv: !!o.archiv });
      if (!f.id) location.hash = '#/firma/' + x.id;
    },
    onDelete: f.id ? () => { if (S.projekte.some(p => p.firmaId === f.id)) { toast('Firma hat Projekte - zuerst löschen oder archivieren'); return; } del('firmen', f.id); location.hash = '#/firmen'; } : null
  });
  const prev = v => { $('#fmLogo', ov).value = v; $('#fmLogoPrev', ov).innerHTML = v ? `<img src="${v}" class="flogo" style="width:56px;height:56px"><button type="button" class="btn sm danger" id="fmLogoDel">Logo entfernen</button>` : ''; };
  $('#fmLogoFile', ov).onchange = e => { const fl = e.target.files[0]; if (fl) bildKlein(fl, 256, prev); };
  $('#fmLogoPrev', ov).addEventListener('click', e => { if (e.target.id === 'fmLogoDel') prev(''); });
}

/* ---------- Projekte ---------- */
const NI = p => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const NTYP = {
  Meeting: NI('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 14.5c3 0 6 1.8 6 5"/>'),
  Teams: NI('<rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3"/>'),
  Call: NI('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1z"/>'),
  Mail: NI('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/>'),
  Notiz: NI('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>')
};
const notizTyp = n => { if (n.typ) return n.typ; const t = n.titel || n.text || ''; return /^(call|telefon)/i.test(t) ? 'Call' : /^mail/i.test(t) ? 'Mail' : /teams/i.test(t) ? 'Teams' : /^(meeting|erster termin|termin)/i.test(t) ? 'Meeting' : 'Notiz'; };
const LTYP = {
  SharePoint: { c: 'sp', i: NI('<circle cx="10" cy="8" r="5"/><circle cx="16" cy="14" r="4"/><circle cx="9" cy="17" r="3"/>') },
  Teams: { c: 'tm', i: NI('<rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3"/>') },
  Andere: { c: '', i: NI('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>') }
};
const linkTyp = u => { const n = /sharepoint\.com|onedrive|1drv\.ms/i.test(u) ? 'SharePoint' : /teams\.microsoft\.com|teams\.live\.com/i.test(u) ? 'Teams' : 'Andere'; return { n, ...LTYP[n] }; };
const linkHost = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
const typOptions = sel => Object.keys(NTYP).map(t => `<option ${t === sel ? 'selected' : ''}>${t}</option>`).join('');

function vProjekte() {
  const ps = S.projekte.filter(p => (UI.pStatus === 'alle' || (UI.pStatus === 'aktiv' ? p.status !== 'Done' : p.status === UI.pStatus)) && (!UI.pFirma || p.firmaId === UI.pFirma))
    .sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status) || a.name.localeCompare(b.name, 'de'));
  return `<div class="head"><h1>Projekte</h1><select data-ui="pFirma" style="width:auto;min-width:180px">${firmaOptions(UI.pFirma, 'Alle Firmen')}</select><div class="seg">${[['aktiv', 'Aktiv'], ...STATUS.map(s => [s, s]), ['alle', 'Alle']].map(([v, t]) => `<button data-act="pStatus" data-v="${v}" class="${UI.pStatus === v ? 'on' : ''}">${t}</button>`).join('')}</div><button class="btn pri" data-act="projektNeu" data-firma="${UI.pFirma}">+ Projekt</button></div>
  ${ps.length ? `<div class="pcards">${ps.map(p => { const ls = S.logs.filter(l => l.projektId === p.id), td = (p.todos || []).filter(t => !t.erledigt).length, f = pFirma(p); return `<a class="pcard" href="#/projekt/${p.id}"><div style="display:flex;justify-content:space-between;align-items:center"><span class="b ${STC[p.status] || ''}">${esc(p.status)}</span>${logoImg(f, 26)}</div><h3>${esc(p.name)}</h3><div class="small muted">${esc(fName(p.firmaId))}</div><div class="meta"><span>${hm(sumMin(ls))} h total</span><span>${td} To-do${td === 1 ? '' : 's'}</span><span>CHF ${chf(ansatz(p))}/h</span></div></a>`; }).join('')}</div>` : '<div class="card empty">Keine Projekte</div>'}`;
}
function vProjekt(id) {
  const p = projekt(id); if (!p) return '<div class="empty">Projekt nicht gefunden</div>';
  const f = pFirma(p) || {}, ls = S.logs.filter(l => l.projektId === id), ol = ls.filter(l => !l.rechnungId && l.verrechenbar !== false);
  const pers = (f.kontakte || []).filter(k => (p.personen || []).includes(k.id)), ext = p.externe || [];
  const todos = [...(p.todos || [])].sort((a, b) => (a.erledigt - b.erledigt) || ((a.faellig || '9999') < (b.faellig || '9999') ? -1 : 1));
  const nl = [...(p.notizen || []).map(n => ({ n, o: id })), ...S.projekte.filter(q => q.id !== id).flatMap(q => (q.notizen || []).filter(n => (n.anteile || []).some(a => a.projektId === id && a.pct > 0)).map(n => ({ n, o: q.id })))].sort((a, b) => b.n.datum.localeCompare(a.n.datum));
  const d = today(), x = (act, t) => `<button class="btn sm ghost" data-act="${act}" data-p="${id}" data-t="${t}" title="Entfernen">✕</button>`;
  return `<div class="head">${logoImg(f, 52)}<h1><a href="#/projekte" class="small" style="text-decoration:none">‹ Projekte</a><br>${esc(p.name)}<span class="sub"><a href="#/firma/${f.id}">${esc(f.name || '?')}</a> · <span class="b ${STC[p.status] || ''}">${esc(p.status)}</span></span></h1>
    ${icBtn('trash', 'projektDel', `data-id="${id}"`, 'Projekt löschen')}</div>
  <div class="card"><h2>Projektdaten</h2>
    <div class="frow" style="grid-template-columns:2fr 1.4fr 1.3fr 1fr">${fld('Projektname', `<input type="text" data-pf="name" data-p="${id}" value="${esc(p.name)}">`)}${fld('Firma', `<select data-pf="firmaId" data-p="${id}">${firmaOptions(p.firmaId)}</select>`)}${fld('Status', `<select data-pf="status" data-p="${id}">${STATUS.map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}${fld('Stundensatz CHF', `<input type="number" step="0.05" min="0" data-pf="ansatz" data-p="${id}" value="${num(p.ansatz) || ''}" placeholder="Firma: ${chf(num(f.ansatz))}">`)}</div>
    ${fld('Beschreibung / Ziel', `<textarea data-pf="beschreibung" data-p="${id}" rows="2">${esc(p.beschreibung || '')}</textarea>`)}
    <div class="small muted" style="margin-top:6px">Änderungen werden automatisch gespeichert. Stundensatz leer = Standard der Firma.</div></div>
  <div class="kpis"><div class="kpi"><span>Stundensatz</span><b>CHF ${chf(ansatz(p))}</b><small>${num(p.ansatz) ? 'Projektansatz' : 'Standard der Firma'}</small></div><div class="kpi"><span>Stunden total</span><b>${hm(sumMin(ls))} h</b></div><div class="kpi"><span>Nicht verrechnet</span><b>CHF ${chf(ol.reduce((a, l) => a + logWert(l), 0))}</b><small>${hm(sumMin(ol))} h</small></div></div>
  <div class="grid g2">
    <div class="card">${cardHead('To-dos', 'todo')}${addForm('todo', `<form class="frow" data-form="todoAdd" data-p="${id}" style="grid-template-columns:1fr 140px auto" autocomplete="off"><input type="text" name="text" placeholder="Neues To-do"><input type="date" name="faellig"><button class="btn pri">Hinzufügen</button></form>`)}
      ${todos.length ? `<div class="list">${todos.map(t => `<div class="li ${t.erledigt ? 'done' : ''}"><input type="checkbox" data-act="todoToggle" data-p="${id}" data-t="${t.id}" ${t.erledigt ? 'checked' : ''}><div class="grow">${esc(t.text)}</div>${t.faellig ? `<span class="b ${!t.erledigt && t.faellig < d ? 'red' : ''}">${fmt(t.faellig)}</span>` : ''}${x('todoDel', t.id)}</div>`).join('')}</div>` : '<div class="empty">Keine To-dos</div>'}</div>
    <div class="card">${cardHead('Personen', 'person')}${addForm('person', personForm(p, f))}${pers.length || ext.length ? `<div class="list">${pers.map(k => kontaktLi(k, `data-act="kontaktEdit" data-firma="${f.id}" data-k="${k.id}"`, '', x('personRemove', k.id))).join('')}${ext.map(k => kontaktLi(k, `data-act="externEdit" data-p="${id}" data-k="${k.id}"`, ` <span class="b blue">${esc(k.org || 'extern')}</span>`, x('externRemove', k.id))).join('')}</div>` : '<div class="empty">Keine Personen</div>'}</div>
  </div>
  <div class="card">${cardHead('Links &amp; Dokumente', 'link')}${addForm('link', `<form class="frow" data-form="linkAdd" data-p="${id}" style="grid-template-columns:1fr 2fr auto" autocomplete="off"><input type="text" name="titel" placeholder="Titel"><input type="url" name="url" placeholder="https://..."><button class="btn pri">Hinzufügen</button></form>`)}
    ${(p.links || []).length ? `<div class="list">${p.links.map(k => { const t = linkTyp(k.url); return `<div class="li"><span class="ntyp ${t.c}" title="${t.n}">${t.i}</span><div class="grow"><a href="${esc(k.url)}" target="_blank" rel="noopener" title="${esc(k.url)}">${esc(k.titel || linkHost(k.url))}</a><div class="small muted">${t.n}</div></div>${x('linkDel', k.id)}</div>`; }).join('')}</div>` : '<div class="empty">Keine Links</div>'}</div>
  <div class="card">${cardHead('Notizen / Protokolle', 'notiz')}${addForm('notiz', `<form data-form="notizAdd" data-p="${id}" autocomplete="off"><div class="frow" style="grid-template-columns:140px 120px 1.5fr 100px auto;align-items:end">${fld('Datum', `<input type="date" name="datum" value="${today()}">`)}${fld('Art', `<select name="typ">${typOptions('Meeting')}</select>`)}${fld('Titel (erscheint als Tätigkeit)', '<input type="text" name="titel" placeholder="z.B. Call Markus">')}${fld('Dauer', '<input type="text" name="dauer" placeholder="0:30">')}<label class="chk" style="padding-bottom:10px"><input type="checkbox" name="verrechenbar" checked>verrechenbar</label></div>
      ${anteilBox(Array.from({ length: UI.anteilN }, (_, i) => ({ projektId: i ? '' : id, pct: i ? 0 : 100 })), p.firmaId)}
      <div class="frow" style="grid-template-columns:1fr auto;align-items:end;margin-top:10px"><textarea name="text" rows="3" placeholder="Protokoll / Details ..."></textarea><button class="btn pri" style="height:38px">Erfassen</button></div>
      <div class="small muted" style="margin:-4px 0 8px">Mit Dauer wird automatisch eine Tätigkeit erstellt (Text = Titel). Dauer leer oder 0 = nur Protokoll.</div></form>`)}
    ${nl.length ? `<div class="list">${nl.map(({ n, o }) => { const t = notizTyp(n), bg = notizLogBadge(n, id, o); return `<div class="li click" style="align-items:flex-start" data-act="notizEdit" data-p="${o}" data-t="${n.id}"><span class="ntyp" title="${t}">${NTYP[t]}</span><div style="width:84px" class="small"><b>${fmt(n.datum)}</b><div class="muted">${t}</div></div><div class="grow">${n.titel ? `<b>${esc(n.titel)}</b>` : ''}${n.text ? `<div style="white-space:pre-wrap">${esc(n.text)}</div>` : ''}${bg.geteilt}</div>${bg.badge}</div>`; }).join('')}</div>` : ''}</div>
  <div class="card">${cardHead('Tätigkeiten', 'log')}${addForm('log', `<form data-form="logAdd" data-p="${id}" autocomplete="off"><div class="frow" style="grid-template-columns:140px 1fr 100px auto;align-items:end">${fld('Datum', `<input type="date" name="datum" value="${today()}">`)}${fld('Tätigkeit', '<input type="text" name="text" placeholder="Was hast du gemacht?">')}${fld('Dauer', '<input type="text" name="dauer" placeholder="1:30">')}<label class="chk" style="padding-bottom:10px"><input type="checkbox" name="verrechenbar" checked>verrechenbar</label></div><div style="text-align:right;margin-bottom:8px"><button class="btn pri">Erfassen</button></div></form>`)}${logTable(ls, false)}</div>`;
}
const CLOCK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="vertical-align:-1px"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const anteileOf = (n, owner) => n.anteile && n.anteile.length ? n.anteile : [{ projektId: owner, pct: 100, logId: n.logId || '' }];
const notizOwner = nid => S.projekte.find(x => (x.notizen || []).some(n => n.id === nid));
const firmaProjektOptions = (fid, sel) => `<option value="">- Projekt wählen -</option>` + S.projekte.filter(p => p.firmaId === fid).sort((a, b) => (a.status === 'Done') - (b.status === 'Done') || a.name.localeCompare(b.name, 'de')).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}${p.status === 'Done' ? ' (Done)' : ''}</option>`).join('');
function anteilRow(pid = '', pct = 100, fid = '') { return `<div class="arow"><select name="ap[]">${firmaProjektOptions(fid, pid)}</select><input type="number" name="apct[]" min="1" max="100" step="1" value="${pct}"><span class="muted">%</span><button type="button" class="btn sm ghost" data-act="anteilDel" title="Entfernen">✕</button></div>`; }
function anteilBox(rows, fid) { return `<div class="anteile" data-firma="${fid}"><div class="f" style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px">Aufteilung auf Projekte</div><div class="arows">${rows.map(r => anteilRow(r.projektId, r.pct, fid)).join('')}</div><div class="btns" style="align-items:center"><button type="button" class="btn sm" data-act="anteilAdd">+ weiteres Projekt</button><span class="small muted asum"></span></div></div>`; }
function anteilVerteilen(box) { const ins = $$('input[name="apct[]"]', box), n = ins.length, base = Math.floor(100 / n); ins.forEach((el, i) => el.value = i === n - 1 ? 100 - base * (n - 1) : base); anteilSumme(box); }
function anteilSumme(box) { const sm = $$('input[name="apct[]"]', box).reduce((a, el) => a + num(el.value), 0), el = $('.asum', box); if (el) { el.textContent = `Summe ${sm}%`; el.style.color = sm === 100 ? '' : 'var(--red)'; } }
document.addEventListener('input', e => { if (e.target.name === 'apct[]') anteilSumme(e.target.closest('.anteile')); });
function notizLogBadge(n, cur, owner) {
  const as = anteileOf(n, owner), a = as.find(x => x.projektId === cur), l = a && a.logId && S.logs.find(x => x.id === a.logId);
  const geteilt = as.length > 1 ? `<div class="small muted" style="margin-top:3px">${as.map(x => `${esc(pName(x.projektId))} ${x.pct}%`).join(' · ')}</div>` : '';
  return { geteilt, badge: l ? `<span class="b ${l.rechnungId ? 'blue' : l.verrechenbar === false ? '' : 'green'}" title="${l.rechnungId ? 'verrechnet' : l.verrechenbar === false ? 'nicht verrechenbar' : 'offen'}">${CLOCK} ${hm(l.minuten)} h${as.length > 1 ? ` (${a.pct}%)` : ''}</span>` : '' };
}
function notizSpeichern(pid, alt, o) {
  const dv = (o.dauer || '').trim(), null0 = /^0+([:.,]0+)?\s*(h|m|min)?$/i.test(dv), min = null0 ? 0 : parseDauer(dv);
  if (dv && !null0 && !min) { toast('Dauer ungültig (z.B. 0:30)'); return false; }
  const titel = (o.titel || '').trim(), text = (o.text || '').trim();
  if (!titel && !text) { toast('Titel oder Text erfassen'); return false; }
  if (min && !titel) { toast('Für die Tätigkeit einen Titel erfassen'); return false; }
  const ap = [].concat(o.ap || []), apct = [].concat(o.apct || []);
  let neu = ap.length ? ap.map((p, i) => ({ projektId: p, pct: Math.round(num(apct[i])) })) : [{ projektId: pid, pct: 100 }];
  if (neu.some(x => !x.projektId)) { toast('Projekt in der Aufteilung wählen'); return false; }
  if (new Set(neu.map(x => x.projektId)).size !== neu.length) { toast('Projekt doppelt in der Aufteilung'); return false; }
  if (neu.some(x => x.pct <= 0) || neu.reduce((a, x) => a + x.pct, 0) !== 100) { toast('Aufteilung muss total 100% ergeben'); return false; }
  const n = { ...(alt || {}), id: (alt && alt.id) || uid(), datum: o.datum || today(), typ: o.typ || 'Notiz', titel, text, logId: '', verrechenbar: !!o.verrechenbar, minuten: min };
  const alt_ = alt ? anteileOf(alt, pid) : [];
  let rest = min;
  neu = neu.map((x, i) => {
    const m = i === neu.length - 1 ? rest : Math.round(min * x.pct / 100); rest -= m;
    const old = alt_.find(a => a.projektId === x.projektId); let log = old && old.logId && S.logs.find(l => l.id === old.logId);
    if (min && m > 0) {
      if (log && log.rechnungId) { if (log.minuten !== m) toast('Teil bereits verrechnet - Dauer bleibt'); put('logs', { ...log, text: titel }); }
      else log = put('logs', { ...(log || {}), datum: n.datum, projektId: x.projektId, text: titel, minuten: m, verrechenbar: !!o.verrechenbar, notizId: n.id });
      return { ...x, logId: log.id };
    }
    if (log) { if (log.rechnungId) { toast('Teil bereits verrechnet - bleibt bestehen'); return { ...x, logId: log.id }; } del('logs', log.id); }
    return { ...x, logId: '' };
  });
  for (const a of alt_) if (!neu.some(x => x.projektId === a.projektId) && a.logId) { const l = S.logs.find(z => z.id === a.logId); if (l && l.rechnungId) { toast('Entfernter Teil ist verrechnet - bleibt bestehen'); neu.push({ ...a, pct: 0 }); } else if (l) del('logs', l.id); }
  n.anteile = neu;
  pListe(pid, 'notizen', l => { const i = l.findIndex(x => x.id === n.id); if (i >= 0) l[i] = n; else l.push(n); return l; });
  toast(min ? 'Protokoll und Tätigkeit gespeichert' : 'Protokoll gespeichert');
}
function notizModal(pid, n) {
  const as = anteileOf(n, pid), logs = as.map(a => a.logId && S.logs.find(l => l.id === a.logId)).filter(Boolean), log = logs[0];
  const tot = logs.reduce((a, l) => a + l.minuten, 0), billed = logs.some(l => l.rechnungId);
  const ov = modal({
    title: 'Protokoll bearbeiten', wide: true,
    body: `<div class="frow c4">${fld('Datum', inp('datum', n.datum, 'date'))}${fld('Art', `<select name="typ">${typOptions(notizTyp(n))}</select>`)}${fld('Dauer total', inp('dauer', tot ? hm(tot) : n.minuten === 0 ? '0:00' : '', 'text', 'placeholder="0:30"'))}<label class="chk" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="verrechenbar" ${(log ? log.verrechenbar !== false : n.verrechenbar !== false) ? 'checked' : ''}>verrechenbar</label></div>
      <div class="frow">${fld('Titel (erscheint als Tätigkeit)', inp('titel', n.titel || ''))}</div>
      ${anteilBox(as.filter(a => a.pct > 0), (projekt(pid) || {}).firmaId)}
      <div class="frow" style="margin-top:10px">${fld('Protokoll / Details', `<textarea name="text" rows="8">${esc(n.text || '')}</textarea>`)}</div>
      ${billed ? '<div class="note">Mindestens ein Teil ist bereits verrechnet. Dessen Dauer und Löschen sind gesperrt.</div>' : '<div class="small muted">Dauer leer oder 0 = nur Protokoll, verknüpfte Tätigkeiten werden entfernt.</div>'}`,
    onSave: o => notizSpeichern(pid, n, o),
    onDelete: () => { if (billed) return toast('Teil bereits verrechnet - zuerst Rechnung löschen'); logs.forEach(l => del('logs', l.id)); pListe(pid, 'notizen', l => l.filter(x => x.id !== n.id)); }
  });
  anteilSumme($('.anteile', ov));
}
function personForm(p, f) {
  const frei = (f.kontakte || []).filter(k => !(p.personen || []).includes(k.id));
  return `<form data-form="personAdd" data-p="${p.id}" autocomplete="off"><div class="frow">${fld('Person', `<select name="wahl" data-act="personWahl">${frei.map(k => `<option value="${k.id}">${esc(k.name)}${k.funktion ? ' (' + esc(k.funktion) + ')' : ''} - ${esc(f.name || '')}</option>`).join('')}<option value="__neu" ${frei.length ? '' : 'selected'}>Andere Person (Freitext) ...</option></select>`)}</div>
    <div class="pfrei ${frei.length ? 'hidden' : ''}">${personFelder({}, true)}</div><div style="text-align:right;margin-bottom:8px"><button class="btn pri">Hinzufügen</button></div></form>`;
}
function persBox(firmaId, sel = []) { const f = firma(firmaId); return f && (f.kontakte || []).length ? f.kontakte.map(k => `<label class="chk"><input type="checkbox" name="personen[]" value="${k.id}" ${sel.includes(k.id) ? 'checked' : ''}>${esc(k.name)}${k.funktion ? ` <span class="muted">(${esc(k.funktion)})</span>` : ''}</label>`).join('') : '<span class="small muted">Keine Ansprechpartner bei dieser Firma erfasst</span>'; }
function projektModal(p = {}) {
  const ov = modal({
    title: p.id ? 'Projekt bearbeiten' : 'Neues Projekt', wide: true,
    body: `<div class="frow c2">${fld('Projektname', inp('name', p.name))}${fld('Firma', `<select name="firmaId" id="pmFirma">${firmaOptions(p.firmaId)}</select>`)}</div>
      <div class="frow c4">${fld('Status', `<select name="status">${STATUS.map(s => `<option ${s === (p.status || 'To-do') ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}${fld('Stundensatz CHF', inp('ansatz', p.ansatz || '', 'number', `step="0.05" min="0" id="pmAnsatz" placeholder="${p.firmaId ? 'Firma: ' + chf(num((firma(p.firmaId) || {}).ansatz)) : 'Standard Firma'}"`))}${fld('Start', inp('start', p.start, 'date'))}${fld('Ende', inp('ende', p.ende, 'date'))}</div>
      <div class="small muted" style="margin:-4px 0 10px">Stundensatz leer = Standard der Firma</div>
      <div class="frow">${fld('Beschreibung / Ziel', `<textarea name="beschreibung" rows="3">${esc(p.beschreibung || '')}</textarea>`)}</div>
      <div class="f" style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px">Personen</div><div id="pmPers" style="display:flex;flex-wrap:wrap;gap:6px 16px">${persBox(p.firmaId, p.personen || [])}</div>`,
    onSave: o => {
      if (!o.name || !o.firmaId) { toast('Name und Firma erfassen'); return false; }
      const x = put('projekte', { todos: [], notizen: [], links: [], ...p, name: o.name, firmaId: o.firmaId, status: o.status, ansatz: num(o.ansatz), start: o.start, ende: o.ende, beschreibung: o.beschreibung, personen: o.personen || [] });
      if (!p.id) location.hash = '#/projekt/' + x.id;
    },
    onDelete: p.id ? () => { if (S.logs.some(l => l.projektId === p.id)) { toast('Projekt hat Tätigkeiten - Status "Done" setzen statt löschen'); return; } del('projekte', p.id); location.hash = '#/projekte'; } : null
  });
  $('#pmFirma', ov).onchange = e => { $('#pmPers', ov).innerHTML = persBox(e.target.value, []); $('#pmAnsatz', ov).placeholder = e.target.value ? 'Firma: ' + chf(num((firma(e.target.value) || {}).ansatz)) : 'Standard Firma'; };
}
function externModal(pid, k = {}) {
  modal({
    title: k.id ? 'Person bearbeiten' : 'Person hinzufügen', body: personFelder(k, true),
    onSave: o => { if (!o.name) { toast('Name fehlt'); return false; } const n = { ...k, id: k.id || uid(), name: o.name, org: o.org, funktion: o.funktion, email: o.email, tel: o.tel, notiz: o.notiz }; pListe(pid, 'externe', l => { const i = l.findIndex(x => x.id === n.id); if (i >= 0) l[i] = n; else l.push(n); return l; }); },
    onDelete: k.id ? () => pListe(pid, 'externe', l => l.filter(x => x.id !== k.id)) : null
  });
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
        rapport: [...logs].sort((a, b) => a.datum.localeCompare(b.datum)).map(l => ({ datum: l.datum, projekt: pName(l.projektId), text: l.text, minuten: l.minuten })),
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
      body: r.rapport.map(x => [fmt(x.datum), x.projekt, x.text, hdec(x.minuten)]),
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
    <div class="frow c2">${fld('MWST-Grenze CHF', inp('mwstGrenze', s.mwstGrenze, 'number'))}</div>
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
  const lk = e.target.closest('a[href]'); if (lk && lk !== b && b.contains(lk)) return;
  const a = b.dataset.act, id = b.dataset.id;
  if (b.tagName === 'INPUT' && b.type === 'file') return;
  const A = {
    logNeu: () => logModal({ projektId: UI.qa.projektId }),
    logNeuP: () => logModal({ projektId: id }),
    logEdit: () => logModal(S.logs.find(l => l.id === id)),
    csv: csvExport,
    alleMonate: () => { UI.logMonat = UI.logMonat ? '' : today().slice(0, 7); schedule(); },
    firmaNeu: () => firmaModal(), firmaEdit: () => firmaModal(firma(id)),
    firmaLogoDel: () => { const f = firma(id); if (f) put('firmen', { ...f, logo: '' }); },
    firmaDel: () => { if (S.projekte.some(p => p.firmaId === id)) return toast('Firma hat Projekte - zuerst löschen oder "archiviert" setzen'); if (confirm('Firma löschen?')) { del('firmen', id); location.hash = '#/firmen'; } },
    kontaktNeu: () => kontaktModal(b.dataset.firma), kontaktEdit: () => { if (e.target.closest('a')) return; const f = firma(b.dataset.firma); kontaktModal(b.dataset.firma, ((f && f.kontakte) || []).find(k => k.id === b.dataset.k)); },
    toggleAdd: () => { const k = b.dataset.k; UI.open[k] = !UI.open[k]; render(); if (UI.open[k]) { const nb = $(`#view [data-act=toggleAdd][data-k="${k}"]`); const el = nb && $(`.addbox input:not([type=hidden]):not([type=date]):not([type=checkbox]), .addbox select`, nb.closest('.card')); el && el.focus(); } },
    externNeu: () => externModal(b.dataset.p),
    anteilAdd: () => { const box = b.closest('.anteile'); $('.arows', box).insertAdjacentHTML('beforeend', anteilRow('', 0, box.dataset.firma)); if (b.closest('.addbox')) UI.anteilN++; anteilVerteilen(box); },
    anteilDel: () => { const box = b.closest('.anteile'); if ($$('.arow', box).length < 2) return toast('Mindestens ein Projekt'); b.closest('.arow').remove(); if (box.closest('.addbox')) UI.anteilN--; anteilVerteilen(box); },
    personRemove: () => { e.stopPropagation(); pListe(b.dataset.p, 'personen', l => l.filter(x => x !== b.dataset.t)); },
    externRemove: () => { e.stopPropagation(); if (confirm('Person entfernen?')) pListe(b.dataset.p, 'externe', l => l.filter(x => x.id !== b.dataset.t)); },
    notizEdit: () => { const p = projekt(b.dataset.p); const n = p && (p.notizen || []).find(x => x.id === b.dataset.t); if (n) notizModal(b.dataset.p, n); },
    projektDel: () => { const p = projekt(id); if (!p) return; if (S.logs.some(l => l.projektId === id)) return toast('Projekt hat Tätigkeiten - Status "Done" setzen statt löschen'); if (confirm('Projekt löschen?')) { del('projekte', id); location.hash = '#/projekte'; } }, externEdit: () => { if (e.target.closest('a')) return; const p = projekt(b.dataset.p); externModal(b.dataset.p, ((p && p.externe) || []).find(k => k.id === b.dataset.k)); },
    projektNeu: () => projektModal({ firmaId: b.dataset.firma || '' }), projektEdit: () => projektModal(projekt(id)),
    pStatus: () => { UI.pStatus = b.dataset.v; schedule(); }, rStatus: () => { UI.rStatus = b.dataset.v; schedule(); },
    todoToggle: () => pListe(b.dataset.p, 'todos', l => l.map(t => t.id === b.dataset.t ? { ...t, erledigt: !t.erledigt, erledigtAm: !t.erledigt ? today() : '' } : t)),
    todoDel: () => pListe(b.dataset.p, 'todos', l => l.filter(t => t.id !== b.dataset.t)),
    linkDel: () => pListe(b.dataset.p, 'links', l => l.filter(t => t.id !== b.dataset.t)),
    spesenNeu: () => spesenModal(), spesenEdit: () => spesenModal(S.spesen.find(s => s.id === id)),
    rechnungNeu: () => rechnungNeu(b.dataset.firma || ''),
    rechnungEdit: () => rechnungEdit(S.rechnungen.find(r => r.id === id)),
    pdf: () => { e.stopPropagation(); rechnungPdf(S.rechnungen.find(r => r.id === id)); },
    logoDel: () => saveSet({ logo: '' }),
    backup, logout: () => AUTH && AUTH.A.signOut(AUTH.auth).then(() => location.reload())
  };
  if (A[a]) { if (b.tagName !== 'INPUT') e.preventDefault(); A[a](); }
});
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.act === 'personWahl') { const fr = $('.pfrei', t.closest('form')); fr.classList.toggle('hidden', t.value !== '__neu'); if (t.value === '__neu') $('input[name=name]', fr).focus(); } });
document.addEventListener('change', e => {
  const t = e.target; if (t.type !== 'file' || !t.files[0]) return;
  if (t.dataset.act === 'logo') logoLaden(t.files[0]);
  if (t.dataset.act === 'firmaLogo') { const f = firma(t.dataset.f); if (f) bildKlein(t.files[0], 256, v => { put('firmen', { ...f, logo: v }); toast('Logo gespeichert'); }); }
  if (t.dataset.act === 'restore') restore(t.files[0]);
  t.value = '';
});
document.addEventListener('submit', e => {
  const f = e.target; if (f.closest('.ov')) return; e.preventDefault();
  if (f.id === 'quick') return quickSave(f);
  const fd = new FormData(f), o = Object.fromEntries(fd), pid = f.dataset.p; o.ap = fd.getAll('ap[]'); o.apct = fd.getAll('apct[]');
  if (f.dataset.form === 'todoAdd' && o.text.trim()) pListe(pid, 'todos', l => [...l, { id: uid(), text: o.text.trim(), faellig: o.faellig || '', erledigt: false }]);
  if (f.dataset.form === 'linkAdd' && o.url.trim()) pListe(pid, 'links', l => [...l, { id: uid(), titel: o.titel.trim(), url: /^https?:\/\//.test(o.url.trim()) ? o.url.trim() : 'https://' + o.url.trim() }]);
  if (f.dataset.form === 'notizAdd') { if (notizSpeichern(pid, null, o) === false) return; }
  if (f.dataset.form === 'logAdd') {
    const min = parseDauer(o.dauer);
    if (!min) return toast('Dauer fehlt oder ungültig (z.B. 1:30)');
    put('logs', { datum: o.datum || today(), projektId: pid, text: (o.text || '').trim(), minuten: min, verrechenbar: !!o.verrechenbar }); toast('Erfasst');
  }
  if (f.dataset.form === 'personAdd') {
    if (o.wahl !== '__neu') pListe(pid, 'personen', l => l.includes(o.wahl) ? l : [...l, o.wahl]);
    else { if (!(o.name || '').trim()) return toast('Name fehlt'); pListe(pid, 'externe', l => [...l, { id: uid(), name: o.name.trim(), org: o.org, funktion: o.funktion, email: o.email, tel: o.tel, notiz: o.notiz }]); }
  }
  if (f.dataset.form === 'projektAdd') { if (!(o.name || '').trim()) return toast('Projektname fehlt'); put('projekte', { firmaId: f.dataset.f, name: o.name.trim(), status: o.status || 'To-do', ansatz: 0, beschreibung: '', personen: [], externe: [], todos: [], notizen: [], links: [] }); toast('Projekt erstellt'); }
  if (f.dataset.form === 'kontaktAdd') {
    const fi = firma(f.dataset.f); if (!fi) return; if (!(o.name || '').trim()) return toast('Name fehlt');
    put('firmen', { ...fi, kontakte: [...(fi.kontakte || []), { id: uid(), name: o.name.trim(), funktion: o.funktion, email: o.email, tel: o.tel, notiz: o.notiz }] });
  }
  if (f.dataset.form === 'notizAdd') UI.anteilN = 1;
  for (const [k, fm] of [['todo', 'todoAdd'], ['link', 'linkAdd'], ['notiz', 'notizAdd'], ['log', 'logAdd'], ['person', 'personAdd'], ['kontakt', 'kontaktAdd'], ['fprojekt', 'projektAdd']]) if (f.dataset.form === fm) UI.open[k] = false;
  if (f.dataset.form === 'settings') { const { logo, ...rest } = o; saveSet({ ...rest, iban: ibanClean(o.iban), frist: num(o.frist), mwstGrenze: num(o.mwstGrenze) }); toast('Gespeichert'); }
  document.activeElement && document.activeElement.blur(); schedule();
});
document.addEventListener('keydown', e => { if (e.key === 'n' && e.altKey) { e.preventDefault(); logModal({ projektId: UI.qa.projektId }); } });

/* ---------- Start ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
if (window.DS_FIREBASE && window.DS_FIREBASE.apiKey) initFirebase(window.DS_FIREBASE).catch(e => { console.error(e); loginScreen('Firebase-Fehler: ' + e.message); });
else initLocal();
