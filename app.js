import { findWake, classify, isYes, isNo, confirmPhrase } from './parse.mjs';

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
      log(`ジャービス: ${j.text}`, j.ok ? '' : 'bad'); say(j.text); setState(listening ? '待機中（「ジャービス」と呼んでください）' : '停止中', listening ? 'on' : 'wait'); return;
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
