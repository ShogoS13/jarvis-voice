// 司令室の表示用の純粋関数（DOM に触らない）。status.json の中身から画面の部品を作る。
const CYAN = '#2fd8ff', AMBER = '#ffb340', CIRC = 465;

export function staleness(asofEpoch, nowMs, limitHours = 5) {
  const t = Number(asofEpoch);
  if (!Number.isFinite(t) || t <= 0) return { stale: true, ageMinutes: null };
  const ageMinutes = Math.max(0, Math.round((nowMs - t) / 60000));
  return { stale: ageMinutes > limitHours * 60, ageMinutes };
}

const s = (v) => String(v ?? '');
const copy = (label, text) => ({ label, text });
const item = (title, meta, fix, copies) => ({ title, meta, fix, copies });

export function detailItems(status, key) {
  const d = status?.details ?? {};
  const list = (v) => (Array.isArray(v) ? v : []);
  if (key === 'approvals' || key === 'needs') {
    const want = key === 'approvals' ? '承認待ち' : '要対応';
    return list(d.approvals).filter((x) => x.status === want).map((x) => item(
      s(x.title), `担当 ${s(x.owner)} / リスク ${s(x.risk)} / ${s(x.action)}`,
      want === '要対応' ? '内容を確認し、問題なければ「クローズして」と依頼。' : 'あなたの判断（承認か却下）が必要。',
      [copy('承認の依頼文をコピー', `「${s(x.title)}」を承認して`), copy('却下の依頼文をコピー', `「${s(x.title)}」は却下して`)]));
  }
  if (key === 'tasks') {
    return list(d.tasks).map((x) => item(s(x.title), `担当 ${s(x.owner)} / リスク ${s(x.risk)}`,
      '次の巡回で担当部署が進めます。急ぐときは依頼してください。', [copy('進める依頼文をコピー', `「${s(x.title)}」を進めて`)]));
  }
  if (key === 'unposted') {
    return list(d.unposted).map((x) => item(s(x.title), `${s(x.channel)} / 予定 ${s(x.post_at)}`,
      '成果物のフォルダ（youtube-未投稿）から、題名・説明つきでアップロード',
      [copy('アップロードの手順を聞く', `「${s(x.title)}」の上げ方を教えて`)]));
  }
  if (key === 'videos') {
    return list(d.video_failures).map((x) => item(s(x.title), `${s(x.channel)} / ${x.error || 'エラー内容なし'}`,
      '台本の画像・音声を確認。原因調査を依頼できます。',
      [copy('原因調査の依頼文をコピー', `「${s(x.title)}」（${s(x.channel)}）の失敗の原因を調べて直して`)]));
  }
  if (key === 'errors') {
    return list(d.errors).map((x) => item(`${s(x.routine)}（${s(x.at)}）`, s(x.note), s(x.hint),
      [copy('調査の依頼文をコピー', `${s(x.routine)} のエラーの原因を調べて直して`)]));
  }
  if (key === 'x') return [item('X 投稿は自動で動いています', `累計 ${status?.x?.posted || 0} 件`, '', [])];
  return [];
}

export function tileModels(status) {
  const st = status ?? {};
  const a = st.approvals ?? {}, v = st.videos ?? {};
  return [
    { key: 'approvals', cls: (a.pending || 0) > 0 ? 'warn' : 'ok', label: '承認待ち', n: a.pending || 0, unit: '件', d: 'タップで詳細' },
    { key: 'needs', cls: (a.needs_action || 0) > 0 ? 'warn' : 'ok', label: '要対応', n: a.needs_action || 0, unit: '件', d: 'タップで詳細' },
    { key: 'tasks', cls: 'info', label: 'タスク（todo）', n: st.tasks?.todo || 0, unit: '件', d: 'タップで詳細' },
    { key: 'x', cls: 'ok', label: 'X 投稿（累計）', n: st.x?.posted || 0, unit: '件', d: '本番の投稿' },
    v.unposted == null
      ? { key: 'unposted', cls: 'ok', label: '未投稿の動画', n: '—', unit: '', d: '取得待ち（次の更新で判定）' }
      : { key: 'unposted', cls: v.unposted > 0 ? 'warn' : 'ok', label: '未投稿の動画', n: v.unposted, unit: '本', d: '上げるべき残り' },
    { key: 'videos', cls: (v.failed || 0) > 0 ? 'warn' : 'ok', label: '動画の失敗', n: v.failed || 0, unit: '本', d: 'タップで詳細' },
    { key: 'errors', cls: (st.errors_24h || 0) >= 5 ? 'bad' : 'ok', label: 'エラー（24時間）', n: st.errors_24h || 0, unit: '件', d: 'タップで詳細' },
  ];
}

export function gaugeModel(budget) {
  const pct = Math.max(0, Math.min(100, Number(budget?.pct) || 0));
  return { pct, dash: `${(pct / 100 * CIRC).toFixed(1)} ${CIRC}`, color: pct >= 80 ? AMBER : CYAN };
}

// ---- 全画面の司令室（3列型）用: 数字・ゲージ・棒グラフ・運用ログの表示モデル ----
const GREEN = '#4ae3a1', RED = '#ff5a5f';
const group = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const yen = (n) => `${group(n)}円`;

export function costModel(cost) {
  if (!cost) return { value: '—', sub: '', pct: 0, warn: false };
  const pct = Math.max(0, Math.min(100, Number(cost.pct) || 0));
  return { value: yen(cost.spent_jpy), sub: `上限 ${yen(cost.limit_jpy)} の ${pct}%`, pct, warn: pct >= 80 };
}

export function revenueModel(revenue) {
  if (!revenue) return { has: false, value: '未入力', sub: '40_Outputs/経理監査/売上.md に書くと表示されます', items: [] };
  return {
    has: true, value: yen(revenue.month_jpy), sub: `累計 ${yen(revenue.total_jpy)}${revenue.updated ? `（${revenue.updated} 時点）` : ''}`,
    items: (revenue.items ?? []).map((i) => ({ name: i.name, value: yen(i.jpy) })),
  };
}

export function successModel(success) {
  if (!success) return { pct: null, label: '—', dash: `0 ${CIRC}`, color: '#6f93a8', sub: '実行記録がまだありません' };
  const pct = Math.max(0, Math.min(100, Number(success.pct) || 0));
  return {
    pct, label: `${pct}%`, dash: `${(pct / 100 * CIRC).toFixed(1)} ${CIRC}`,
    color: pct >= 95 ? GREEN : pct >= 80 ? AMBER : RED, sub: `成功 ${success.ok} / 失敗 ${success.error}（直近7日）`,
  };
}

export function barModels(daily) {
  const rows = Array.isArray(daily) ? daily : [];
  const max = Math.max(1, ...rows.map((d) => Number(d.runs) || 0));
  return rows.map((d) => {
    const runs = Number(d.runs) || 0;
    const h = runs === 0 ? 0 : Math.max(4, Math.round((runs / max) * 100));
    return { label: String(d.date).slice(5).replace('-', '/'), runs, errors: Number(d.errors) || 0, h, cls: runs > 0 && (Number(d.errors) || 0) / runs >= 0.2 ? 'bad' : 'ok' }; // 失敗が少しある日は赤にしない（割合が 2 割以上の日だけ）
  });
}

export function logModels(log) {
  return (Array.isArray(log) ? log : []).map((l) => ({
    cls: String(l.routine).startsWith('jarvis-repair') ? 'fix' : l.status === 'error' ? 'bad' : l.status === 'skipped' ? 'dim' : 'ok',
    text: `${l.time}  ${l.routine}  ${l.note ?? ''}`.trimEnd(),
  }));
}

export function repairModel(repairs) {
  return { value: String(repairs?.merged_7d ?? 0), unit: '件', sub: '直近7日に、自分で直して反映した件数' };
}
