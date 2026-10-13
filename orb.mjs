// 司令室の中央の球: 粒子の生成・投影・状態による色（純粋関数）と、canvas への描画（ブラウザ）。

// 種つきの乱数（同じ種なら同じ並び）
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 単位球の面に散らし、半径は、核の近くから、外へ伸びる放射状（リールの「放射する球」の形）
export function makeParticles(n, seed = 1) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const r = 0.6 + 0.65 * Math.pow(rand(), 1.6);
    out.push({ x: s * Math.cos(th) * r, y: u * r, z: s * Math.sin(th) * r, phase: rand() * Math.PI * 2, size: 0.5 + rand() * 1.1, tone: rand() });
  }
  return out;
}

// Y 軸、X 軸の順に回して、遠近をつける。depth は、手前ほど大きい
export function project(p, rotY, rotX, radius, cx, cy, fov = 3) {
  const x1 = p.x * Math.cos(rotY) + p.z * Math.sin(rotY);
  const z1 = -p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
  const y2 = p.y * Math.cos(rotX) - z1 * Math.sin(rotX);
  const z2 = p.y * Math.sin(rotX) + z1 * Math.cos(rotX);
  const scale = fov / (fov - z2);
  return { x: cx + x1 * radius * scale, y: cy + y2 * radius * scale, scale, depth: z2 };
}

const MOODS = {
  listening: { name: 'listening', core: '#7ff0ff', halo: '#2fd8ff', speed: 1.8 },
  busy: { name: 'busy', core: '#2fd8ff', halo: '#8a5cff', speed: 2.2 },
  alert: { name: 'alert', core: '#ff5a5f', halo: '#ff2d55', speed: 1.4 },
  attention: { name: 'attention', core: '#ffb340', halo: '#ff8a3d', speed: 1.15 },
  calm: { name: 'calm', core: '#ffd23f', halo: '#ffb340', speed: 1 },
};

// 優先: 話している > 実行中 > エラー・成功率の低下 > 承認待ち > 通常
export function orbMood(status, { listening = false, busy = false } = {}) {
  if (listening) return MOODS.listening;
  if (busy) return MOODS.busy;
  const st = status ?? {};
  const pct = st.metrics?.success?.pct;
  if ((st.errors_24h || 0) >= 5 || (Number.isFinite(pct) && pct < 80)) return MOODS.alert;
  if ((st.approvals?.pending || 0) + (st.approvals?.needs_action || 0) > 0) return MOODS.attention;
  return MOODS.calm;
}

// レーダーの点: 承認待ち・要対応の数だけ（黄金角で散らす。同じ数なら同じ位置）
export function radarBlips(n) {
  const count = Math.max(0, Math.min(12, Math.floor(Number(n) || 0)));
  return Array.from({ length: count }, (_, i) => ({ a: (i * 137.5) % 360, r: 0.3 + ((i * 0.37) % 1) * 0.6 }));
}

// ---- 以下は、ブラウザだけで動く ----
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

export function startOrb(canvas, getMood, { count = 2600, reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  const parts = makeParticles(count, 20261013);
  let w = 0, h = 0, dpr = 1, raf = 0, last = 0, rot = 0;
  let core = hex(MOODS.calm.core), halo = hex(MOODS.calm.halo), speed = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
  }

  function draw(now) {
    const m = getMood();
    core = mix(core, hex(m.core), 0.05); halo = mix(halo, hex(m.halo), 0.05); speed += (m.speed - speed) * 0.05;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now; rot += dt * 0.16 * speed;
    const t = now / 1000, cx = canvas.width / 2, cy = canvas.height / 2, R = Math.min(canvas.width, canvas.height) * 0.36;
    const rotX = 0.38 + Math.sin(t * 0.1) * 0.1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';

    // 核の光
    const pulse = 1 + 0.06 * Math.sin(t * 1.6 * speed);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.9 * pulse);
    g.addColorStop(0, `rgba(255,255,255,.95)`);
    g.addColorStop(0.12, `rgba(${core.map(Math.round)},.9)`);
    g.addColorStop(0.45, `rgba(${halo.map(Math.round)},.28)`);
    g.addColorStop(1, `rgba(${halo.map(Math.round)},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.9 * pulse, 0, Math.PI * 2); ctx.fill();

    // 粒子と、外へ伸びる光の筋
    for (const p of parts) {
      const breathe = 1 + 0.05 * Math.sin(t * 1.3 * speed + p.phase);
      const q = project({ x: p.x * breathe, y: p.y * breathe, z: p.z * breathe }, rot, rotX, R, cx, cy);
      const a = Math.max(0.08, Math.min(1, 0.3 + 0.7 * ((q.depth + 1.25) / 2.5)));
      const c = p.tone < 0.45 ? [255, 255, 255] : p.tone < 0.8 ? halo : core;
      ctx.fillStyle = `rgba(${c.map(Math.round)},${a.toFixed(3)})`;
      const s = Math.max(1, p.size * q.scale * dpr * 1.15);
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      if (p.tone > 0.86) { // 一部の粒子から、核へ向かう光の筋
        const q0 = project({ x: p.x * 0.35, y: p.y * 0.35, z: p.z * 0.35 }, rot, rotX, R, cx, cy);
        ctx.strokeStyle = `rgba(${halo.map(Math.round)},${(a * 0.34).toFixed(3)})`; ctx.lineWidth = dpr * 0.8;
        ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }
  resize();
  window.addEventListener('resize', () => { resize(); if (reduced) draw(performance.now()); });
  document.addEventListener('visibilitychange', () => {
    if (reduced) return;
    if (document.hidden) { cancelAnimationFrame(raf); last = 0; } else raf = requestAnimationFrame(loop);
  });
  if (reduced) draw(performance.now()); else raf = requestAnimationFrame(loop);
  return { stop: () => cancelAnimationFrame(raf) };
}
