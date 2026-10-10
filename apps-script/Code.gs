/**
 * 컬링 기량 기록부 — Google Apps Script 서버
 *
 * 구조 (architecture_spec.md 참고)
 *  - doGet        : 웹앱 화면(Index.html) 제공
 *  - api          : 화면에서 부르는 유일한 관문. PIN 확인 → 허용된 동작만 실행
 *  - 시트 저장소  : 탭별 읽기/쓰기 (id · data(JSON) · 수정시각 · 읽기용 열)
 *  - 메뉴         : 초기 설정, PIN 설정, 평가결과 표 만들기
 *
 * 비밀값(PIN)은 코드에 적지 않습니다. 시트 메뉴 [컬링 기록부 → 코치 PIN 설정]으로
 * 스크립트 속성(COACH_PIN)에 저장됩니다.
 */

var COLS = ['teams', 'players', 'sessions', 'records', 'notes'];
var HEAD = {
  teams:    ['id', 'data', '수정시각', '팀 이름'],
  players:  ['id', 'data', '수정시각', '이름', '팀', '포지션'],
  sessions: ['id', 'data', '수정시각', '날짜', '시트', '팀', '세션 이름'],
  records:  ['id', 'data', '수정시각', '날짜', '시트', '팀', '선수', '종합'],
  notes:    ['id', 'data', '수정시각', '날짜', '선수', '분류', '내용'],
  config:   ['id', 'data', '수정시각'],
  '로그':   ['시각', '동작', '내용']
};
var ID_RE = /^[A-Za-z0-9_\-]{1,120}$/;
var MAX_JSON = 45000;          // 셀 한 칸 한도(50,000자)보다 작게
var FAIL_LIMIT = 20;           // 10분 안에 PIN 오류 허용 횟수

/* ---------------- 웹앱 ---------------- */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('컬링 기량 기록부')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/* GitHub Pages 등 외부 주소에서 부를 때 쓰는 입구 (JSON 요청/응답) */
function doPost(e) {
  var b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { b = {}; }
  var r = api(b.pin, b.action, b.payload);
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- 시트 메뉴 ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('컬링 기록부')
    .addItem('① 초기 설정 (처음 한 번)', 'setup')
    .addItem('② 코치 PIN 설정·변경', 'setPin')
    .addSeparator()
    .addItem('평가결과 표 만들기', 'buildReport')
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  props_().setProperty('SHEET_ID', ss.getId());
  Object.keys(HEAD).forEach(function (n) { tab_(n); });
  var first = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  var msg = '초기 설정을 마쳤습니다.\n다음으로 [컬링 기록부 → ② 코치 PIN 설정·변경]에서 PIN을 정하세요.\n\n' +
            '안내: 각 탭의 data 열은 앱이 쓰는 원본입니다. 수정은 앱에서만 하고, 시트는 보기·백업용으로 쓰세요.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function setPin() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('코치 PIN 설정', '코치들이 앱에 들어갈 때 입력할 PIN(숫자 4~12자리)을 입력하세요.\nPIN을 바꾸면 모든 기기에서 새 PIN을 다시 입력해야 합니다.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pin = String(r.getResponseText() || '').trim();
  if (!/^\d{4,12}$/.test(pin)) { ui.alert('숫자 4~12자리로 입력해 주세요.'); return; }
  props_().setProperty('COACH_PIN', pin);
  CacheService.getScriptCache().remove('pinFails');
  log_('PIN 변경', '');
  ui.alert('PIN을 저장했습니다.');
}

/* ---------------- API 관문 ---------------- */
function api(pin, action, payload) {
  try {
    var cache = CacheService.getScriptCache();
    var fails = Number(cache.get('pinFails') || 0);
    if (fails >= FAIL_LIMIT) return { error: 'locked', message: 'PIN 오류가 많아 10분간 잠겼습니다.' };
    var real = props_().getProperty('COACH_PIN');
    if (!real) return { error: 'nopin', message: '관리자가 아직 PIN을 설정하지 않았습니다.' };
    if (String(pin || '') !== real) {
      cache.put('pinFails', String(fails + 1), 600);
      return { error: 'pin', message: 'PIN이 맞지 않습니다.' };
    }
    payload = payload || {};
    switch (action) {
      case 'load':      return { ok: true, data: loadAll_(), serverTime: new Date().toISOString() };
      case 'put':       return put_(payload.col, payload.id, payload.data);
      case 'del':       return del_(payload.col, payload.id);
      case 'delMany':   return delMany_(payload.items);
      case 'putSkills': return putSkills_(payload.skills);
      default:          return { error: 'bad_action', message: '알 수 없는 요청입니다.' };
    }
  } catch (e) {
    log_('오류:' + action, String(e && e.stack || e));
    return { error: 'server', message: '서버 오류: ' + (e && e.message || e) };
  }
}

/* ---------------- 시트 저장소 ---------------- */
function props_() { return PropertiesService.getScriptProperties(); }
function ss_() {
  var id = props_().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function tab_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (HEAD[name][1] === 'data') sh.setColumnWidth(2, 120);
  }
  return sh;
}
function readTab_(name) {
  var sh = tab_(name);
  var n = sh.getLastRow();
  if (n < 2) return [];
  var vals = sh.getRange(2, 1, n - 1, 2).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    try { var o = JSON.parse(vals[i][1]); o.id = String(vals[i][0]); out.push(o); } catch (e) { /* 손상된 행은 건너뜀 */ }
  }
  return out;
}
function loadAll_() {
  var d = {};
  COLS.forEach(function (c) { d[c] = readTab_(c); });
  var cfg = readTab_('config').filter(function (x) { return x.id === 'skills'; })[0];
  d.skills = cfg && cfg.skills ? cfg.skills : null;
  return d;
}
function findRow_(sh, id) {
  var n = sh.getLastRow();
  if (n < 2) return -1;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}
function safe_(v) { // 수식 주입 방지
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  v = String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function readable_(col, d) {
  var nameOf = function (tabName, id) {
    if (!id) return '';
    var row = readTab_(tabName).filter(function (x) { return x.id === id; })[0];
    return row ? row.name : '';
  };
  switch (col) {
    case 'teams':    return [d.name];
    case 'players':  return [d.name, nameOf('teams', d.teamId), d.position];
    case 'sessions': return [d.date, d.sheet || '', nameOf('teams', d.teamId), d.title || ''];
    case 'records': {
      var v = []; for (var k in (d.skillScores || {})) v.push(Number(d.skillScores[k]));
      var o = v.length ? Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length * 100) / 100 : '';
      return [d.date, d.sheet || '', nameOf('teams', d.teamId), nameOf('players', d.playerId), o];
    }
    case 'notes':    return [d.date, nameOf('players', d.playerId), d.cat, d.text];
  }
  return [];
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { error: 'busy', message: '동시에 저장하는 사람이 많습니다. 잠시 후 다시 시도합니다.' };
  try { return fn(); } finally { lock.releaseLock(); }
}
function put_(col, id, data) {
  if (COLS.indexOf(col) < 0) return { error: 'bad_col', message: '허용되지 않은 저장 위치입니다.' };
  if (!ID_RE.test(String(id || ''))) return { error: 'bad_id', message: '잘못된 id 형식입니다.' };
  if (!data || typeof data !== 'object') return { error: 'bad_data', message: '저장할 내용이 없습니다.' };
  delete data.id;
  var json = JSON.stringify(data);
  if (json.length > MAX_JSON) return { error: 'too_big', message: '한 번에 저장할 수 있는 크기를 넘었습니다.' };
  return withLock_(function () {
    var sh = tab_(col);
    var row = [id, json, new Date().toISOString()].concat(readable_(col, data).map(safe_));
    var r = findRow_(sh, id);
    if (r > 0) sh.getRange(r, 1, 1, row.length).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    return { ok: true };
  });
}
function del_(col, id) {
  if (COLS.indexOf(col) < 0) return { error: 'bad_col', message: '허용되지 않은 저장 위치입니다.' };
  if (!ID_RE.test(String(id || ''))) return { error: 'bad_id', message: '잘못된 id 형식입니다.' };
  return withLock_(function () {
    var sh = tab_(col);
    var r = findRow_(sh, id);
    if (r > 0) sh.deleteRow(r);
    return { ok: true };
  });
}
function delMany_(items) {
  if (!Array.isArray(items) || !items.length || items.length > 1000) return { error: 'bad_data', message: '삭제할 항목이 올바르지 않습니다.' };
  var byCol = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    if (COLS.indexOf(it.col) < 0 || !ID_RE.test(String(it.id || ''))) return { error: 'bad_data', message: '삭제할 항목이 올바르지 않습니다.' };
    (byCol[it.col] = byCol[it.col] || {})[String(it.id)] = true;
  }
  return withLock_(function () {
    var n = 0;
    Object.keys(byCol).forEach(function (col) {
      var sh = tab_(col), last = sh.getLastRow();
      if (last < 2) return;
      var ids = sh.getRange(2, 1, last - 1, 1).getValues(), rows = [];
      for (var r = 0; r < ids.length; r++) if (byCol[col][String(ids[r][0])]) rows.push(r + 2);
      rows.sort(function (a, b) { return b - a; }).forEach(function (row) { sh.deleteRow(row); n++; });
    });
    log_('일괄 삭제', n + '행');
    return { ok: true, deleted: n };
  });
}
function putSkills_(skills) {
  if (!Array.isArray(skills) || !skills.length) return { error: 'bad_data', message: '평가 항목이 비어 있습니다.' };
  var json = JSON.stringify({ skills: skills });
  if (json.length > MAX_JSON) return { error: 'too_big', message: '평가 항목이 너무 많습니다.' };
  return withLock_(function () {
    var sh = tab_('config');
    var row = ['skills', json, new Date().toISOString()];
    var r = findRow_(sh, 'skills');
    if (r > 0) sh.getRange(r, 1, 1, 3).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, 3).setValues([row]);
    return { ok: true };
  });
}
function log_(action, text) {
  try {
    var sh = tab_('로그');
    sh.appendRow([new Date(), safe_(action), safe_(String(text).slice(0, 2000))]);
    if (sh.getLastRow() > 1000) sh.deleteRows(2, 200);
  } catch (e) { /* 로그 실패는 무시 */ }
}

/* ---------------- 보고서 ---------------- */
function buildReport() {
  var d = loadAll_();
  var byId = function (arr) { var m = {}; arr.forEach(function (x) { m[x.id] = x; }); return m; };
  var T = byId(d.teams), P = byId(d.players), S = byId(d.sessions);
  var head = ['날짜', '시트', '팀', '선수', '포지션', '기능', '테스트 항목', '회차 점수', '항목 평균', '메모'];
  var rows = [];
  d.records.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function (r) {
    var s = S[r.sessionId] || { items: [] }; var p = P[r.playerId] || {};
    (s.items || []).forEach(function (it, i) {
      var a = (r.attempts || {})[it.itemId]; if (!a) return;
      rows.push([r.date, s.sheet || '', (T[r.teamId] || {}).name || '', p.name || '', p.position || '', it.skillName || '', it.name || '',
        a.map(function (v) { return v == null ? '·' : v; }).join(' '), (r.scores || {})[it.itemId], i === 0 ? (r.memo || '') : ''].map(safe_));
    });
  });
  var ss = ss_();
  var sh = ss.getSheetByName('평가결과') || ss.insertSheet('평가결과');
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  try { SpreadsheetApp.getUi().alert('평가결과 표를 만들었습니다. (' + rows.length + '행)'); } catch (e) {}
}
