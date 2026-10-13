// 司令室の舞台（左のパネル・レーダー・球の状態表示）の、表示用の純粋関数。
import { radarBlips } from './orb.mjs';

const LABELS = { calm: '待機中', listening: '聞いています', busy: '実行中', alert: '警告', attention: '承認待ち' };
export const moodLabel = (name) => LABELS[name] ?? LABELS.calm;

// 左のパネル: 承認待ち＋要対応、エラー（24時間）、未投稿の動画
export function kvModels(status) {
  const st = status ?? {};
  const appr = (st.approvals?.pending || 0) + (st.approvals?.needs_action || 0);
  const err = st.errors_24h || 0;
  const un = st.videos?.unposted;
  return {
    appr: { text: `${appr} 件`, cls: appr > 0 ? 'warn' : 'ok' },
    err: { text: `${err} 件`, cls: err >= 5 ? 'bad' : err > 0 ? 'warn' : 'ok' },
    unposted: un == null ? { text: '—', cls: '' } : { text: `${un} 本`, cls: un > 0 ? 'warn' : 'ok' },
  };
}

// レーダーの点の位置（％）。半径 1 を、円の端の手前（48%）に対応させる
export function blipStyles(n) {
  return radarBlips(n).map((p) => {
    const ang = (p.a * Math.PI) / 180;
    return { left: `${(50 + Math.cos(ang) * p.r * 48).toFixed(1)}%`, top: `${(50 + Math.sin(ang) * p.r * 48).toFixed(1)}%` };
  });
}
