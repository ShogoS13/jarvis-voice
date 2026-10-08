// ジャービス音声窓口: 呼びかけの検出と、命令の分類（ブラウザでも node でも動く純関数）
const WAKE = /(ジャービス|ジャーヴィス|ジャービズ|ジャーヴィズ|じゃーびす|jarvis)/i;
const ACTION = /(承認|却下|クローズ|進めて|やって|実行|投稿|送って|削除|公開)/;
const YES = /^(はい|ハイ|お願い|おねがい|オッケー|オーケー|ok|okay)/i;
const NO = /^(いいえ|イイエ|キャンセル|やめ|中止|だめ|ダメ|違う)/i;

export function findWake(transcript) {
  const s = String(transcript ?? '').trim();
  const m = s.match(WAKE);
  if (!m) return null;
  const command = s.slice(m.index + m[0].length).replace(/^[\s、,。.!！?？]+/, '').trim();
  return { command };
}
export const classify = (text) => (ACTION.test(String(text ?? '')) ? 'action' : 'query');
export const isYes = (text) => YES.test(String(text ?? '').trim());
export const isNo = (text) => NO.test(String(text ?? '').trim());
export const confirmPhrase = (text) => `「${text}」を実行します。よろしければ「はい」と言ってください。`;
