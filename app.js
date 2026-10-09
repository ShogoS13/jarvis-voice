import { findWake, classify, isYes, isNo, confirmPhrase } from './parse.mjs';
import { staleness, detailItems, tileModels, gaugeModel } from './hud-view.mjs';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } },
};
let rec = null, listening = false, pending = null, awaitingUntil = 0;

function log(text, cls = '') { const li = document.createElement('li'); li.className = cls; li.textContent = text; $('log').prepend(li); }
function setState(text, cls) { const s = $('state'); s.textContent = text; s.className = cls; }
function say(text) {
  if (!$('speak').checked || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; speechSynthesis.cancel(); speechSynthesis.speak(u);
}
const gh = () => ({ repo: store.get('repo', 'ShogoS13/ai-company-vault'), token: store.get('token') });
const newId = () => `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;

async function api(path, init = {}) {
  const { token } = gh();
  return fetch(`https://api.github.com${path}`, { ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers ?? {}) } });
}

async function send(text) {
  const { repo, token } = gh();
  if (!token) { log('GitHub のトークンが未設定です。設定欄に入力して保存してください。', 'bad'); return; }
  const mode = classify(text), id = newId();
  log(`あなた: ${text}（${mode === 'action' ? '実行' : '確認'}）`, 'me');
  const r = await api(`/repos/${repo}/actions/workflows/jarvis.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { id, text, mode } }) });
  if (!r.ok) { log(`送信に失敗しました（HTTP ${r.status}）。${r.status === 401 || r.status === 403 ? 'トークンの権限や期限を確認してください。' : r.status === 404 ? 'リポジトリ名かワークフローを確認してください。' : ''}`, 'bad'); return; }
  setState('実行中…', 'wait');
  const end = Date.now() + 150e3;
  while (Date.now() < end) {
    await new Promise((res) => setTimeout(res, 3000));
    const a = await api(`/repos/${repo}/contents/answers/${id}.json?ref=jarvis-answers`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (a.ok) {
      const j = JSON.parse(await a.text());
      log(`ジャービス: ${j.text}`, j.ok ? '' : 'bad'); say(j.text); setState(listening ? '待機中（「ジャービス」と呼んでください）' : '停止中', listening ? 'on' : 'wait'); refreshHud(); return;
    }
  }
  log('応答がありません。Actions の実行を確認してください。', 'bad'); setState(listening ? '待機中' : '停止中', listening ? 'on' : 'wait');
}

async function handle(transcript) {
  if (pending) {
    const cmd = pending; pending = null;
    if (isYes(transcript)) { say('実行します。'); await send(cmd); } else { log('キャンセルしました。'); say('キャンセルしました。'); }
    return;
  }
  const w = findWake(transcript);
  const command = w ? w.command : (Date.now() < awaitingUntil ? transcript.trim() : '');
  if (w && !command) { awaitingUntil = Date.now() + 8000; say('はい。'); log('（呼びかけを聞きました。ご用件をどうぞ）'); return; }
  if (!command) return;
  awaitingUntil = 0;
  if (classify(command) === 'action') { pending = command; const p = confirmPhrase(command); log(p); say(p); return; }
  await send(command);
}

function start() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { log('このブラウザは音声認識に対応していません。Chrome を使うか、入力欄をお使いください。', 'bad'); return; }
  rec = new SR(); rec.lang = 'ja-JP'; rec.continuous = true; rec.interimResults = false;
  rec.onresult = (e) => { const t = e.results[e.results.length - 1][0].transcript; if (e.results[e.results.length - 1].isFinal) handle(t); };
  rec.onerror = (e) => { if (e.error === 'not-allowed') { log('マイクの使用が許可されていません。アドレスバーのマイクの設定を許可してください。', 'bad'); listening = false; setState('停止中', 'wait'); } };
  rec.onend = () => { if (listening) { try { rec.start(); } catch { /* すぐ再開できないときは次の onend で */ } } };
  listening = true; rec.start(); setState('待機中（「ジャービス」と呼んでください）', 'on'); $('toggle').textContent = '待機をやめる';
}
function stop() { listening = false; try { rec.stop(); } catch { /* 既に止まっている */ } setState('停止中', 'wait'); $('toggle').textContent = '待機を始める'; }

$('toggle').onclick = () => (listening ? stop() : start());
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { const t = e.target.value.trim(); e.target.value = ''; if (t) handle(`ジャービス ${t}`); } });
$('save').onclick = () => { store.set('repo', $('repo').value.trim()); store.set('token', $('token').value.trim()); $('token').value = ''; log('設定を保存しました。'); };
$('repo').value = store.get('repo', 'ShogoS13/ai-company-vault');

// ---- 司令室（ダッシュボード）----
const yen = (n) => `${Number(n).toLocaleString('ja-JP')}円`;
let hudStatus = null, hudCurrent = null, hudBusy = false;
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function hudMsg(text) { const m = $('hudmsg'); m.textContent = text || ''; m.classList.toggle('on', !!text); }

function copyBtn(label, text) {
  const b = el('button', 'small', label); b.type = 'button';
  b.onclick = async () => {
    $('reqtext').textContent = `依頼文: ${text}`;
    try { await navigator.clipboard.writeText(text); b.textContent = 'コピーしました'; setTimeout(() => { b.textContent = label; }, 1800); } catch { /* 画面の依頼文を手で写せる */ }
  };
  return b;
}
function runBtn(text) {
  const b = el('button', 'small', 'そのまま実行'); b.type = 'button';
  b.onclick = () => { const t = $('text'); t.value = text; t.focus(); log(`入力欄に依頼文を入れました。Enter で送信します: ${text}`); };
  return b;
}

function renderTiles() {
  const t = $('tiles'); t.textContent = '';
  for (const m of tileModels(hudStatus)) {
    const b = el('button', `tile ${m.cls}`); b.type = 'button'; b.setAttribute('aria-pressed', hudCurrent === m.key ? 'true' : 'false');
    const n = el('div', 'n', String(m.n)); n.appendChild(el('span', 'u', m.unit));
    b.append(el('div', 'label', m.label), n, el('div', 'd', m.d));
    b.onclick = () => { hudCurrent = hudCurrent === m.key ? null : m.key; renderTiles(); renderDetail(); };
    t.appendChild(b);
  }
}
const DETAIL_TITLES = { approvals: '承認待ち', needs: '要対応', tasks: 'タスク（todo）', videos: '動画の失敗', unposted: '未投稿の動画', errors: 'エラー（24時間）', x: 'X 投稿' };
function renderDetail() {
  const p = $('detail-panel'), ul = $('detail'); ul.textContent = ''; $('reqtext').textContent = '';
  if (!hudCurrent || !hudStatus) { p.hidden = true; return; }
  $('detail-title').textContent = DETAIL_TITLES[hudCurrent] || '詳細';
  const items = detailItems(hudStatus, hudCurrent);
  for (const it of items) {
    const li = el('li', 'item'); li.appendChild(el('div', 't', it.title));
    if (it.meta) li.appendChild(el('div', 'm', it.meta));
    if (it.fix) li.appendChild(el('div', 'fix', `解消の道筋: ${it.fix}`));
    const box = el('div', 'acts');
    for (const c of it.copies) { box.appendChild(copyBtn(c.label, c.text)); box.appendChild(runBtn(c.text)); }
    li.appendChild(box); ul.appendChild(li);
  }
  if (!items.length) ul.appendChild(el('li', 'none', '該当する項目はありません。（詳細は次の自動更新で表示されます）'));
  p.hidden = false;
}
function renderHud(d) {
  hudStatus = d;
  const g = gaugeModel(d.budget), b = d.budget || {};
  $('asof').textContent = d.asof ? `${String(d.asof).replace('T', ' ').slice(0, 16)} JST` : '—';
  const gg = $('gauge'); gg.setAttribute('stroke-dasharray', g.dash); gg.setAttribute('stroke', g.color);
  $('gauge-pct').textContent = `${g.pct}%`;
  $('spent').textContent = `${yen(b.spent_jpy || 0)} / 上限 ${yen(b.limit_jpy || 0)}`;
  renderTiles(); renderDetail();
  const ul = $('alerts'); ul.textContent = '';
  for (const x of d.alerts || []) {
    const li = el('li'), lv = x.level === 'bad' ? ['p-bad', '警告'] : x.level === 'warn' ? ['p-warn', '注意'] : ['p-info', '情報'];
    li.append(el('span', `pill ${lv[0]}`, lv[1]), el('span', null, x.text)); ul.appendChild(li);
  }
  if (!ul.children.length) { const li = el('li'); li.append(el('span', 'pill p-ok', '正常'), el('span', null, '注意の信号はありません。')); ul.appendChild(li); }
  const tb = $('channels'); tb.textContent = '';
  for (const c of d.channels || []) {
    const tr = el('tr'); tr.append(el('td', null, c.name || c.id), el('td', 'num-r', c.subscribers == null ? '—' : String(c.subscribers)), el('td', 'num-r', c.videos == null ? '—' : String(c.videos))); tb.appendChild(tr);
  }
  if (!tb.children.length) { const tr = el('tr'), td = el('td', 'waiting', 'チャンネルのデータなし'); td.colSpan = 3; tr.appendChild(td); tb.appendChild(tr); }
  updateStale();
}
function updateStale() {
  const s = $('stale');
  if (!hudStatus) { s.classList.remove('on'); return; }
  const st = staleness(hudStatus.asof_epoch, Date.now());
  s.textContent = st.stale ? `データが古くなっています（${st.ageMinutes == null ? '時刻不明' : `約 ${Math.round(st.ageMinutes / 60)} 時間前`}）。「更新」を押してください。` : '';
  s.classList.toggle('on', st.stale);
}

async function refreshHud() {
  const { repo, token } = gh();
  if (!token) { hudMsg('司令室を表示するには、下の設定で GitHub のトークンを保存してください。'); return; }
  if (hudBusy) return;
  hudBusy = true;
  try {
    const r = await api(`/repos/${repo}/contents/status.json?ref=jarvis-answers`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (r.status === 404) { hudMsg('司令室のデータがまだありません。「更新」を押すと作られます。'); return; }
    if (!r.ok) { hudMsg(`司令室のデータを取得できませんでした（HTTP ${r.status}）。${r.status === 401 || r.status === 403 ? 'トークンの権限や期限を確認してください。' : ''}`); return; }
    const d = JSON.parse(await r.text());
    hudMsg(''); renderHud(d);
  } catch { hudMsg('司令室のデータを取得できませんでした。通信を確認してください。'); }
  finally { hudBusy = false; }
}
async function requestHudUpdate() {
  const { repo, token } = gh();
  if (!token) { hudMsg('司令室を更新するには、下の設定で GitHub のトークンを保存してください。'); return; }
  const btn = $('refresh'); btn.disabled = true;
  try {
    const r = await api(`/repos/${repo}/actions/workflows/hud.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
    if (!r.ok) { hudMsg(`更新の依頼に失敗しました（HTTP ${r.status}）。`); return; }
    hudMsg('更新を依頼しました。40 秒ほどで反映されます。');
    await new Promise((res) => setTimeout(res, 40e3));
    hudMsg(''); await refreshHud();
  } catch { hudMsg('更新の依頼を送れませんでした。通信を確認してください。'); }
  finally { btn.disabled = false; }
}
$('refresh').onclick = requestHudUpdate;
setInterval(() => { if (!document.hidden) { refreshHud(); updateStale(); } }, 60e3);
window.addEventListener('focus', refreshHud);
refreshHud();
