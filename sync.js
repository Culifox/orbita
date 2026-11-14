/* Синхронизация с Google Диском через свой скрипт в Google-таблице.
   Адрес скрипта и ключ хранятся только на устройстве (не в данных и не в коде на GitHub). */

let syncCfg = null, syncTimer = null, syncBusy = false, syncListening = false;
const SYNC_APP = 'orbita';
const syncKey = () => KEY + '-sync';
const syncOn = () => !!(syncCfg && syncCfg.url && syncCfg.key);
function syncLoadCfg() { try { syncCfg = JSON.parse(localStorage.getItem(syncKey())) || null; } catch (e) { syncCfg = null; } }
function syncSaveCfg() { try { if (syncCfg) localStorage.setItem(syncKey(), JSON.stringify(syncCfg)); else localStorage.removeItem(syncKey()); } catch (e) {} }

async function syncCall(op, extra) {
  const r = await fetch(syncCfg.url, { method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ key: syncCfg.key, app: SYNC_APP, op }, extra || {})) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error === 'key' ? 'неверный ключ' : 'ошибка скрипта');
  return j;
}
function syncDone(err) {
  syncCfg.last = Date.now();
  syncCfg.err = err ? String(err.message || err) : '';
  syncSaveCfg();
  const s = document.getElementById('syncStatus');
  if (s) s.textContent = syncStatusText();
}
function syncStatusText() {
  if (!syncOn()) return '';
  if (syncCfg.err) return 'не получилось: ' + syncCfg.err + '. Попробую снова, когда будет интернет';
  if (!syncCfg.last) return 'подключена, ещё не синхронизировалась';
  const d = new Date(syncCfg.last), same = ymd(d) === today();
  return 'включена · последняя ' + (same ? 'сегодня' : fmt(ymd(d))) + ' в ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + (syncCfg.dirty ? ' · есть неотправленные изменения' : '');
}

// вызывается из save(): помечаем, что есть свежие изменения, и отправляем через пару секунд
function syncTouch() {
  if (!syncOn()) return;
  syncCfg.dirty = true;
  syncCfg.localAt = Date.now();
  syncSaveCfg();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPush, 1500);
}
async function syncPush() {
  if (!syncOn() || syncBusy) return;
  syncBusy = true;
  const at = syncCfg.localAt || Date.now();
  try {
    await syncCall('put', { data: JSON.stringify(S), at });
    syncCfg.serverAt = at;
    if (syncCfg.localAt === at) syncCfg.dirty = false;
    syncDone();
  } catch (e) { syncDone(e); }
  syncBusy = false;
}
function syncAdopt(j) {
  try { localStorage.setItem(KEY, j.data); } catch (e) {}
  S = load(); S.sprints = S.sprints || []; S.name = S.name || '';
  syncCfg.serverAt = j.at; syncCfg.localAt = j.at; syncCfg.dirty = false;
  vw = null; dayF = null;
  render();
}
// забираем изменения с Диска: при открытии приложения и при возвращении в него
async function syncPull() {
  if (!syncOn() || syncBusy) return;
  syncBusy = true;
  try {
    const j = await syncCall('get');
    if (!j.data) { syncBusy = false; return syncPush(); }
    if (j.at > (syncCfg.serverAt || 0)) {
      if (syncCfg.dirty && (syncCfg.localAt || 0) > j.at) { syncBusy = false; return syncPush(); }
      if (syncCfg.dirty) await syncCall('backup', { data: JSON.stringify(S), at: syncCfg.localAt || Date.now() });
      syncAdopt(j);
    } else if (syncCfg.dirty) { syncBusy = false; return syncPush(); }
    syncDone();
  } catch (e) { syncDone(e); }
  syncBusy = false;
}

// код подключения: «MD1.» + адрес скрипта и ключ, закодированные одной строкой
function syncParse(code) {
  const s = String(code || '').trim().replace(/^MD1\./, '');
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (o && /^https:\/\/script\.google(usercontent)?\.com\//.test(o.u) && o.k) return { url: o.u, key: o.k };
  } catch (e) {}
  return null;
}
function syncMsg(t) { const m = document.getElementById('syncMsg'); if (m) m.textContent = t; }
async function syncConnect(code) {
  const c = syncParse(code);
  if (!c) { syncMsg('Код не подходит: скопируй его целиком.'); return; }
  syncMsg('Подключаю…');
  syncCfg = { url: c.url, key: c.key };
  try {
    const j = await syncCall('get');
    const finish = () => { syncDone(); syncListen(); sheet = null; render(); toast('Синхронизация включена'); };
    if (!j.data) { syncCfg.localAt = Date.now(); syncCfg.dirty = true; syncSaveCfg(); await syncPush(); return finish(); }
    if (!S.sprints.length) { syncSaveCfg(); syncAdopt(j); return finish(); }
    if (confirm('На Google Диске уже есть данные. Взять их? Данные на этом устройстве заменятся. «Отмена» — наоборот, отправить на Диск данные с этого устройства.')) { syncSaveCfg(); syncAdopt(j); }
    else { syncSaveCfg(); syncCfg.localAt = Date.now(); syncCfg.dirty = true; await syncPush(); }
    finish();
  } catch (e) {
    syncCfg = null; syncSaveCfg();
    syncMsg('Не получилось подключиться: ' + e.message + '. Проверь интернет и код.');
  }
}
function syncHtml() {
  if (!syncOn()) return '<span class="lbl" style="margin-top:20px">Синхронизация с Google Диском</span>' +
    '<div class="sm" style="margin-bottom:8px">Чтобы данные не потерялись и были на всех устройствах. Вставь код синхронизации.</div>' +
    '<textarea class="in" id="syncCode" placeholder="Вставь сюда код"></textarea>' +
    '<button class="btn2" data-act="syncpaste" style="margin-top:8px">Вставить код из буфера</button>' +
    '<button class="btn" data-act="syncconnect">Подключить</button><div class="sm" id="syncMsg"></div>';
  return '<span class="lbl" style="margin-top:20px">Синхронизация с Google Диском</span>' +
    '<div class="c yl" style="margin-bottom:10px"><span id="syncStatus">' + esc(syncStatusText()) + '</span></div>' +
    '<button class="btn" data-act="syncnow">Синхронизировать сейчас</button>' +
    '<button class="btn2" data-act="syncoff">Отключить на этом устройстве</button><div class="sm" id="syncMsg"></div>';
}
function syncAct(a) {
  if (a === 'syncconnect') { syncConnect(document.getElementById('syncCode').value); return true; }
  if (a === 'syncpaste') {
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(t => { document.getElementById('syncCode').value = t.trim(); syncConnect(t); }, () => syncMsg('Не получилось вставить: зажми поле и выбери «Вставить».'));
    else syncMsg('Зажми поле выше и выбери «Вставить».');
    return true;
  }
  if (a === 'syncnow') { syncMsg('Синхронизирую…'); syncPull().then(() => syncMsg('')); return true; }
  if (a === 'syncoff') {
    if (!confirm('Отключить синхронизацию на этом устройстве? Данные останутся и здесь, и на Диске.')) return true;
    syncCfg = null; syncSaveCfg(); sheet = null; render(); return true;
  }
  return false;
}
function syncListen() {
  if (syncListening) return;
  syncListening = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncPull(); });
  window.addEventListener('online', () => syncPull());
}
function syncStart() {
  syncLoadCfg();
  if (!syncOn()) return;
  syncListen();
  syncPull();
}
