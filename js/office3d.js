// Studio Kartun Parodi — Kantor 3D (Three.js 0.187)
// Arah seni: kantor studio malam yang hangat. Dinding hijau tua + wainscot walnut,
// lantai parket, karpet, lampu gantung kuningan, jendela kota malam, papan episode
// (whiteboard + sticky notes 3D yang tersinkron data), meja karyawan sebanyak isi tim
// (layout dihitung dinamis, bisa dibangun ulang saat karyawan ditambah/dihapus) dengan animasi idle.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { animate } from 'animejs';
import { STAGES, STAGE_COLORS } from './employees.js';

// ---------------------------------------------------------------- data
export { STAGE_COLORS };
const STAGE_ORDER = STAGES;
const STAGE_TITLE = { ide: 'IDE', naskah: 'NASKAH', suara: 'SUARA', edit: 'EDIT', terbit: 'TERBIT' };

// Daftar meja yang sedang dibangun (karyawan + warna css). Diisi ulang di tempat oleh rebuildDesks().
export const DESKS = [];

const ROOM = { x0: -9, x1: 9, zBack: -5.5, zFront: 4.6, h: 6 };
// HOME dihitung ulang oleh computeLayout() sesuai jumlah meja (nilai awal = framing 1 baris)
const HOME = { pos: new THREE.Vector3(0, 5.6, 11.2), target: new THREE.Vector3(0, 1.55, -1.2) };

// ---------------------------------------------------------------- layout meja dinamis
// Baris depan: busur z = -0.8 + 0.06·x², slot berjarak 2.7 dalam x ±5.4 (skala penuh).
// Baris belakang: busur lebih datar, slot digeser setengah jarak supaya tidak tertutup baris depan.
// Kalau slot tidak cukup, semua meja diskala kecil (jarak + baris ikut rapat) → jumlah meja tidak dibatasi.
const DESK_SPACING = 2.7, ROW_GAP = 2.4, FRONT_Z = -0.8, BACK_LIMIT = -3.5;
const MAX_PENDANT_LIGHTS = 8, MAX_DESK_LIGHTS = 12;
function rowSlots(r, s) {
  const sp = DESK_SPACING * s, half = r === 0 ? 5.4 : 6.8, xs = [];
  if (r % 2 === 0) {
    const k = Math.floor(half / sp + 1e-6);
    xs.push(0); for (let j = 1; j <= k; j++) xs.push(j * sp, -j * sp);
  } else {
    const k = Math.floor(half / sp + 0.5 + 1e-6);
    for (let j = 0; j < k; j++) xs.push((j + 0.5) * sp, -(j + 0.5) * sp);
  }
  return xs; // urut dari tengah ke luar
}
function computeLayout(n) {
  let s = 1, rows = [];
  for (let guard = 0; guard < 400; guard++) {
    rows = [];
    for (let r = 0; ; r++) {
      const z = FRONT_Z - r * ROW_GAP * s;
      if (r > 0 && z < BACK_LIMIT) break;
      rows.push({ r, z, xs: rowSlots(r, s) });
    }
    if (rows.reduce((a, R) => a + R.xs.length, 0) >= n) break;
    s *= 0.93;
  }
  const spots = [];
  let left = n, lastRowZ = FRONT_Z;
  rows.forEach((R) => {
    if (left <= 0) return;
    const m = Math.min(left, R.xs.length);
    // baris depan yang belum penuh dibuat simetris; baris belakang memakai slot celah dari tengah ke luar
    const xs = R.r === 0 && m < R.xs.length
      ? Array.from({ length: m }, (_, i) => (i - (m - 1) / 2) * DESK_SPACING * s)
      : R.xs.slice(0, m);
    xs.sort((a, b) => a - b);
    const k = R.r === 0 ? 0.06 : 0.035;
    xs.forEach((x) => spots.push({ x, z: R.z + k * x * x, row: R.r, s }));
    lastRowZ = R.z; left -= m;
  });
  const depth = Math.max(0, FRONT_Z - lastRowZ);
  const maxX = spots.reduce((a, p) => Math.max(a, Math.abs(p.x)), 0) + 1.1 * s;
  const wide = Math.max(0, maxX - 6.5);
  const pos = new THREE.Vector3(0, 5.6 + depth * 0.6 + wide * 0.3, 11.2 + depth * 0.35 + wide * 0.9);
  const target = new THREE.Vector3(0, 1.55 - depth * 0.08, -1.2 - depth * 0.4);
  // setengah sudut horizontal yang dibutuhkan supaya meja terluar (+ margin) tetap di dalam frame
  const need = spots.reduce((a, p) => Math.max(a, Math.atan((Math.abs(p.x) + 0.6) / Math.max(1, pos.z - p.z))), 0);
  const hHalf = Math.min(40, Math.max(30.5, THREE.MathUtils.radToDeg(need)));
  return { spots, s, rows: rows.filter((R) => R.z >= lastRowZ).length, home: { pos, target }, hHalf };
}

// ---------------------------------------------------------------- state
let renderer, scene, camera, controls, clock;
let canvasEl, labelsEl, stageEl, cb = {};
let maxAniso = 4;
const pickables = [];
const desks = {};
const updaters = [];
const steamSprites = [];
let boardGroup, noteGroup;
let hoverId = null, activeId = null, gliding = false;
let lastInteract = 0, visible = true, reducedMotion = false;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let rand = mulberry32(20261125);
// lapisan meja (meja + karakter + lampu gantung) — dibuang & dibangun ulang oleh rebuildDesks()
let deskLayer = null, layoutInfo = null, lastCounts = {};
// selama membangun lapisan meja, updater/uap kopi dicatat ke lapisan itu (bukan global) supaya ikut terbuang
let sink = null;
const onFrame = (f) => (sink ? sink.updaters : updaters).push(f);

// ---------------------------------------------------------------- util
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seedOf = (s) => [...String(s)].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) | 0, 7);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = (a, b) => a + rand() * (b - a);
function std(color, rough = 0.8, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}
function add(geo, material, parent, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  parent.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, ws = 24, hs = 16) => new THREE.SphereGeometry(r, ws, hs);

function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = maxAniso;
  t.userData = { canvas: c, ctx: g };
  return t;
}
function noise(g, w, h, n, alpha, light = false) {
  const v = light ? 255 : 0;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrapText(g, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let cur = ''; let used = 0;
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur); cur = w;
      if (lines.length === maxLines) break;
    } else cur = test;
    used++;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (used < words.length || lines.some((l) => g.measureText(l).width > maxW)) {
    let last = lines[lines.length - 1] || '';
    while (g.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  return lines;
}
const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const MONO = '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';

let glowTexCache = null;
function glowTex() {
  if (glowTexCache) return glowTexCache;
  glowTexCache = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  glowTexCache.userData.shared = true; // dipakai bersama — jangan di-dispose saat meja dibangun ulang
  return glowTexCache;
}
function glow(color, size, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  s.scale.set(size, size, 1);
  return s;
}

// ---------------------------------------------------------------- tekstur prosedural
function woodFloorTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rows = 8, ph = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -R(0, w * 0.5);
      while (x < w) {
        const pw = w * R(0.34, 0.7);
        const base = [R(118, 146), R(74, 92), R(44, 56)].map(Math.round);
        const gr = g.createLinearGradient(0, r * ph, 0, r * ph + ph);
        gr.addColorStop(0, `rgb(${base.map((v) => v + 8)})`);
        gr.addColorStop(1, `rgb(${base.map((v) => v - 10)})`);
        g.fillStyle = gr; g.fillRect(x, r * ph, pw, ph);
        for (let i = 0; i < 18; i++) {
          g.strokeStyle = `rgba(48,24,10,${R(0.04, 0.13)})`;
          g.lineWidth = R(0.5, 1.8);
          g.beginPath();
          const y0 = r * ph + R(0, ph), f = R(0.008, 0.02), a = R(1, 3.5);
          for (let xx = x; xx <= x + pw; xx += 6) g.lineTo(xx, y0 + Math.sin(xx * f + i) * a);
          g.stroke();
        }
        if (rand() < 0.35) {
          const kx = x + R(30, pw - 30), ky = r * ph + R(20, ph - 20);
          g.strokeStyle = 'rgba(50,25,10,0.25)';
          for (let k = 1; k < 5; k++) { g.beginPath(); g.ellipse(kx, ky, k * 5, k * 2.2, 0, 0, Math.PI * 2); g.stroke(); }
        }
        g.fillStyle = 'rgba(22,12,6,0.8)'; g.fillRect(x, r * ph, 2, ph);
        x += pw;
      }
      g.fillStyle = 'rgba(22,12,6,0.85)'; g.fillRect(0, r * ph, w, 2);
    }
    noise(g, w, h, 9000, 0.06);
  }, { repeat: [4, 2.4] });
}
const walnutCache = {};
function walnutTex(light = false) {
  const k = light ? 'l' : 'd';
  if (walnutCache[k]) return walnutCache[k];
  walnutCache[k] = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = light ? '#9a6a43' : '#5e3b24'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = light ? `rgba(70,38,18,${R(0.06, 0.2)})` : `rgba(28,14,6,${R(0.08, 0.28)})`;
      g.lineWidth = R(0.6, 2.4);
      g.beginPath();
      const y0 = R(0, h), f = R(0.004, 0.014), a = R(2, 8), ph = R(0, 6);
      for (let x = 0; x <= w; x += 6) g.lineTo(x, y0 + Math.sin(x * f + ph) * a + Math.sin(x * f * 3.1) * a * 0.3);
      g.stroke();
    }
    noise(g, w, h, 3000, 0.05, true);
  });
  walnutCache[k].userData.shared = true;
  return walnutCache[k];
}
function rugTex() {
  return canvasTex(1024, 640, (g, w, h) => {
    g.fillStyle = '#7b3a2c'; g.fillRect(0, 0, w, h);
    const bands = [[0, '#e9dcc4', 6], [18, '#2d3b4f', 22], [44, '#e9dcc4', 6], [56, '#a6503a', 6]];
    bands.forEach(([o, c, lw]) => { g.strokeStyle = c; g.lineWidth = lw; g.strokeRect(14 + o, 14 + o, w - 28 - o * 2, h - 28 - o * 2); });
    g.save(); g.translate(w / 2, h / 2);
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = k % 2 ? '#e9dcc4' : '#d9a24a'; g.lineWidth = 5;
      const s = 200 - k * 42;
      g.beginPath(); g.moveTo(0, -s * 0.8); g.lineTo(s * 1.4, 0); g.lineTo(0, s * 0.8); g.lineTo(-s * 1.4, 0); g.closePath(); g.stroke();
    }
    g.restore();
    for (let i = 0; i < 26; i++) {
      const x = 130 + (i % 13) * 63, y = i < 13 ? 110 : h - 110;
      g.fillStyle = '#d9a24a'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 26000; i++) {
      g.strokeStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,230,200'},${R(0.02, 0.08)})`;
      const x = R(0, w), y = R(0, h);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y + R(-3, 3)); g.stroke();
    }
  });
}
function wallTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2b4842'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = R(0, w), y = R(0, h);
      const gr = g.createRadialGradient(x, y, 0, x, y, R(40, 160));
      gr.addColorStop(0, `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},0.035)`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    noise(g, w, h, 14000, 0.05); noise(g, w, h, 6000, 0.03, true);
  }, { repeat: [1, 1] });
}
function cityTex() {
  return canvasTex(2048, 768, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#060a1f'); sky.addColorStop(0.42, '#141a44'); sky.addColorStop(0.62, '#3b2a5c');
    sky.addColorStop(0.72, '#b4566a'); sky.addColorStop(0.8, '#f08c5a'); sky.addColorStop(1, '#1a1426');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 380; i++) {
      g.fillStyle = `rgba(255,255,255,${R(0.2, 0.9)})`;
      g.fillRect(R(0, w), R(0, h * 0.5), R(1, 2.4), R(1, 2.4));
    }
    const layers = [
      { top: [370, 470], col: '#2a2245', win: 0.12, ww: 5, gap: 14 },
      { top: [330, 520], col: '#1a1730', win: 0.35, ww: 7, gap: 16 },
      { top: [280, 560], col: '#0f0e1c', win: 0.45, ww: 9, gap: 20 },
    ];
    layers.forEach((L, li) => {
      let x = -20;
      while (x < w) {
        const bw = R(60, 170), top = R(L.top[0], L.top[1]);
        g.fillStyle = L.col; g.fillRect(x, top, bw, h - top);
        if (rand() < 0.25) g.fillRect(x + bw / 2 - 2, top - R(20, 60), 4, 60);
        for (let yy = top + 12; yy < h - 10; yy += L.gap) {
          for (let xx = x + 8; xx < x + bw - 8; xx += L.ww + 7) {
            if (rand() < L.win) {
              const warm = rand() < 0.7;
              g.fillStyle = warm ? `rgba(255,${R(180, 215) | 0},${R(110, 150) | 0},${R(0.55, 0.95)})` : `rgba(180,210,255,${R(0.4, 0.8)})`;
              g.fillRect(xx, yy, L.ww, L.ww * 1.2);
            }
          }
        }
        g.fillStyle = L.col;
        x += bw + (li === 0 ? R(-10, 10) : R(4, 26));
      }
    });
    const haze = g.createLinearGradient(0, h * 0.55, 0, h);
    haze.addColorStop(0, 'rgba(240,140,90,0)'); haze.addColorStop(1, 'rgba(240,140,90,0.12)');
    g.fillStyle = haze; g.fillRect(0, 0, w, h);
  });
}
function cloudTex() {
  return canvasTex(512, 200, (g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = R(80, w - 80), y = R(70, h - 50), r = R(30, 80);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(120,110,170,0.32)'); gr.addColorStop(1, 'rgba(120,110,170,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  });
}
function posterTex(kind) {
  return canvasTex(360, 500, (g, w, h) => {
    const P = {
      a: ['#ffc857', '#ff7a59', 'SIDANG JADI KUIS', 'Episode 01 • Parodi Politik'],
      b: ['#6cb8ff', '#3c4fd8', 'MACET vs KERETA', 'Episode 02 • Drama Komuter'],
      c: ['#ff7aa2', '#7d3cff', 'CABAI MEROKET', 'Episode 03 • Ekonomi Dapur'],
    }[kind];
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, P[0]); gr.addColorStop(1, P[1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 12; i++) { g.save(); g.translate(w / 2, 210); g.rotate((i / 12) * Math.PI * 2); g.fillRect(0, -8, 300, 16); g.restore(); }
    g.fillStyle = '#fff3e0'; g.beginPath(); g.arc(w / 2, 210, 82, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1b2a';
    g.beginPath(); g.arc(w / 2 - 30, 196, 11, 0, Math.PI * 2); g.arc(w / 2 + 30, 196, 11, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#1b1b2a'; g.lineCap = 'round';
    g.beginPath(); g.arc(w / 2, 222, 34, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    if (kind === 'b') { g.fillStyle = '#1b1b2a'; g.fillRect(w / 2 - 90, 118, 180, 18); g.fillRect(w / 2 - 55, 70, 110, 52); }
    if (kind === 'c') { g.fillStyle = '#e63946'; g.beginPath(); g.ellipse(w / 2 + 70, 120, 18, 46, 0.6, 0, Math.PI * 2); g.fill(); }
    if (kind === 'a') { g.fillStyle = '#1b1b2a'; g.fillRect(w / 2 - 62, 168, 124, 6); }
    g.fillStyle = '#1b1b2a'; g.font = `900 40px ${FONT}`; g.textAlign = 'center';
    wrapText(g, P[2], w - 40, 2).forEach((l, i) => g.fillText(l, w / 2, 360 + i * 44));
    g.font = `600 18px ${FONT}`; g.fillStyle = 'rgba(27,27,42,0.8)'; g.fillText(P[3], w / 2, 466);
  });
}
function neonTex() {
  return canvasTex(1024, 180, (g, w, h) => {
    // ukur dulu supaya seluruh teks (termasuk huruf pertama & terakhir) muat di tekstur
    g.font = `800 88px ${FONT}`;
    const fit = Math.min(88, Math.floor(88 * (w - 90) / g.measureText('STUDIO KARTUN PARODI').width));
    g.font = `800 ${fit}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [blur, col] of [[38, 'rgba(255,120,160,0.9)'], [16, 'rgba(255,170,200,1)'], [0, '#fff1f6']]) {
      g.shadowBlur = blur; g.shadowColor = '#ff5d8f'; g.fillStyle = col;
      g.fillText('STUDIO KARTUN PARODI', w / 2, h / 2 + 4);
    }
  });
}
function clockFaceTex() {
  return canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f6efe2'; g.beginPath(); g.arc(c, c, 124, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1e2433';
    for (let i = 0; i < 60; i++) {
      g.save(); g.translate(c, c); g.rotate((i / 60) * Math.PI * 2);
      const big = i % 5 === 0;
      g.fillRect(-(big ? 3 : 1), -116, big ? 6 : 2, big ? 16 : 7); g.restore();
    }
    g.font = `700 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [['12', 0], ['3', 90], ['6', 180], ['9', 270]].forEach(([n, a]) => {
      const r = (a - 90) * Math.PI / 180; g.fillText(n, c + Math.cos(r) * 84, c + Math.sin(r) * 84);
    });
    g.font = `600 13px ${FONT}`; g.fillStyle = '#c0563f'; g.fillText('SKP • JAKARTA', c, c + 40);
  });
}
function nameplateTex(desk) {
  return canvasTex(512, 112, (g, w, h) => {
    g.fillStyle = '#16191f'; roundRect(g, 0, 0, w, h, 18); g.fill();
    g.fillStyle = desk.css; g.fillRect(0, 0, 16, h);
    // nama bebas dari form → perkecil font bila tidak muat di papan nama
    const fit = (txt, weight, size) => {
      g.font = `${weight} ${size}px ${FONT}`;
      const m = g.measureText(txt).width, max = w - 60;
      if (m > max) g.font = `${weight} ${Math.max(12, Math.floor((size * max) / m))}px ${FONT}`;
    };
    const title = desk.name.toUpperCase();
    const sub = (desk.role ? desk.role.toUpperCase() + '  •  ' : '') + 'TAHAP ' + STAGE_TITLE[desk.stage];
    g.textBaseline = 'middle';
    g.fillStyle = '#f5efe4'; fit(title, 800, 40);
    g.fillText(title, 40, h / 2 - 8);
    g.fillStyle = desk.css; fit(sub, 700, 20);
    g.fillText(sub, 40, h - 18);
  });
}

// ---------------------------------------------------------------- layar monitor
const SCREEN_W = 512, SCREEN_H = 320;
function screenChrome(g, title, accent) {
  g.textAlign = 'left';
  g.fillStyle = '#0c1120'; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  g.fillStyle = '#141b2e'; g.fillRect(0, 0, SCREEN_W, 30);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(16 + i * 18, 15, 5, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = accent; g.font = `700 14px ${MONO}`; g.textBaseline = 'middle';
  g.fillText(title, 76, 16);
}
const SCRIPT_LINES = [
  ['#7d8aa8', '// EPISODE: Sidang Jadi Kuis'],
  ['#ffc857', 'HOOK (0-3 dtk):'],
  ['#e6e9f2', '  "Pak, ini sidang atau cerdas cermat?"'],
  ['#6cb8ff', 'HAKIM:'],
  ['#e6e9f2', '  Pertanyaan nomor tiga, waktu habis!'],
  ['#ff7aa2', 'SAKSI:'],
  ['#e6e9f2', '  Saya pilih... bantuan penonton.'],
  ['#4fd1a1', 'PUNCHLINE:'],
  ['#e6e9f2', '  Penonton: "LANJUT KE IKLAN!"'],
  ['#7d8aa8', '// caption: sidang rasa kuis'],
];
const SCRIPT_TOTAL = SCRIPT_LINES.reduce((a, l) => a + l[1].length, 0);
function drawScreen(kind, g, t, accent) {
  if (kind === 'trends') {
    screenChrome(g, 'TREN RADAR  •  LIVE', accent);
    const items = [['#DascoGoldenOasis', 'X', 0.94], ['Macet vs Kereta Cepat', 'TikTok', 0.82], ['Sound "ya ndak tau"', 'TikTok', 0.67], ['Harga Cabai Meroket', 'YouTube', 0.52], ['Kucing Oren Demo', 'X', 0.4]];
    items.forEach(([name, plat, v], i) => {
      const y = 50 + i * 52;
      g.fillStyle = '#7d8aa8'; g.font = `700 15px ${MONO}`; g.fillText(String(i + 1).padStart(2, '0'), 14, y + 8);
      g.fillStyle = '#e6e9f2'; g.font = `600 17px ${FONT}`; g.fillText(name, 48, y + 6);
      g.fillStyle = '#1d2540'; roundRect(g, 48, y + 20, 330, 9, 4); g.fill();
      const vv = v * (0.92 + 0.08 * Math.sin(t * 1.7 + i));
      g.fillStyle = accent; roundRect(g, 48, y + 20, 330 * vv, 9, 4); g.fill();
      g.fillStyle = plat === 'X' ? '#e6e9f2' : plat === 'TikTok' ? '#ff7aa2' : '#ff6b6b';
      g.font = `700 12px ${MONO}`; g.fillText(plat.toUpperCase(), 396, y + 8);
      g.fillStyle = '#4fd1a1'; g.fillText('▲' + Math.round(vv * 99) + '%', 396, y + 26);
    });
    return;
  }
  if (kind === 'code') {
    screenChrome(g, 'naskah_ep01.json', accent);
    let budget = Math.floor((t * 16) % (SCRIPT_TOTAL + 60));
    g.font = `500 15px ${MONO}`;
    SCRIPT_LINES.forEach(([col, txt], i) => {
      const y = 50 + i * 26;
      g.fillStyle = '#3c4766'; g.fillText(String(i + 1).padStart(2, ' '), 12, y);
      const show = txt.slice(0, Math.max(0, budget));
      const typing = budget >= 0 && budget < txt.length;
      budget -= txt.length;
      g.fillStyle = col; g.fillText(show, 44, y);
      if (typing && Math.sin(t * 8) > 0) { g.fillStyle = accent; g.fillRect(46 + g.measureText(show).width, y - 9, 8, 18); }
    });
    return;
  }
  if (kind === 'wave') {
    screenChrome(g, 'VO_Karakter_A.wav', accent);
    const rec = Math.sin(t * 4) > -0.2;
    g.fillStyle = rec ? '#ff4d5e' : '#5a2530'; g.beginPath(); g.arc(SCREEN_W - 70, 15, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e6e9f2'; g.font = `700 13px ${MONO}`; g.fillText('REC', SCREEN_W - 58, 16);
    const mid = 150;
    g.fillStyle = '#1d2540'; g.fillRect(0, mid, SCREEN_W, 1);
    for (let x = 0; x < SCREEN_W; x += 5) {
      const p = x * 0.045 - t * 6;
      const env = 0.35 + 0.65 * Math.abs(Math.sin(p * 0.21));
      const a = (Math.sin(p) * 0.5 + Math.sin(p * 2.7 + 1) * 0.3 + Math.sin(p * 5.3) * 0.2) * env;
      const hgt = Math.abs(a) * 92 + 2;
      g.fillStyle = x > SCREEN_W * 0.62 ? '#3a4566' : accent;
      g.fillRect(x, mid - hgt, 3, hgt * 2);
    }
    g.fillStyle = '#ffffff'; g.fillRect(SCREEN_W * 0.62, 40, 2, 220);
    const s = Math.floor(t) % 60;
    g.font = `700 22px ${MONO}`; g.fillStyle = '#e6e9f2';
    g.fillText(`00:${String(s).padStart(2, '0')}:${String(Math.floor((t * 30) % 30)).padStart(2, '0')}`, 16, 290);
    for (let i = 0; i < 2; i++) {
      const lv = 0.5 + 0.45 * Math.abs(Math.sin(t * 7 + i * 1.3));
      g.fillStyle = '#1d2540'; g.fillRect(300, 272 + i * 16, 190, 9);
      const gr = g.createLinearGradient(300, 0, 490, 0);
      gr.addColorStop(0, '#4fd1a1'); gr.addColorStop(0.7, '#ffc857'); gr.addColorStop(1, '#ff4d5e');
      g.fillStyle = gr; g.fillRect(300, 272 + i * 16, 190 * lv, 9);
    }
    return;
  }
  if (kind === 'timeline') {
    screenChrome(g, 'Remotion  •  ep01_final  9:16', accent);
    g.fillStyle = '#ffd9a8'; g.fillRect(20, 42, 96, 170);
    g.fillStyle = '#fff3e0'; g.beginPath(); g.arc(68, 110, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1b2a'; g.beginPath(); g.arc(58, 104, 4, 0, Math.PI * 2); g.arc(78, 104, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1b1b2a'; g.lineWidth = 3; g.beginPath(); g.arc(68, 114 + Math.sin(t * 6) * 1.5, 10, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    g.fillStyle = '#1b1b2a'; g.fillRect(26, 180, 84, 18);
    g.fillStyle = '#fff'; g.font = `700 10px ${FONT}`; g.fillText('LANJUT KE IKLAN!', 29, 190);
    const tracks = [['V1', [[0, 0.35, '#a78bfa'], [0.37, 0.7, '#8b6cf0'], [0.72, 1, '#a78bfa']]], ['V2', [[0.1, 0.3, '#6cb8ff'], [0.5, 0.82, '#6cb8ff']]], ['SUB', [[0, 0.22, '#ffc857'], [0.25, 0.5, '#ffc857'], [0.53, 0.8, '#ffc857'], [0.83, 1, '#ffc857']]], ['A1', [[0, 1, '#4fd1a1']]], ['MUS', [[0, 0.9, '#ff7aa2']]]];
    tracks.forEach(([n, clips], i) => {
      const y = 46 + i * 34;
      g.fillStyle = '#7d8aa8'; g.font = `700 11px ${MONO}`; g.fillText(n, 132, y + 12);
      clips.forEach(([a, b, c]) => { g.fillStyle = c; roundRect(g, 170 + a * 320, y, (b - a) * 320 - 3, 24, 4); g.fill(); });
    });
    const ph = 170 + ((t * 0.08) % 1) * 320;
    g.fillStyle = '#ff4d5e'; g.fillRect(ph, 40, 2, 180);
    const pr = 0.6 + ((t * 0.02) % 0.4);
    g.fillStyle = '#1d2540'; roundRect(g, 20, 246, 470, 14, 7); g.fill();
    g.fillStyle = accent; roundRect(g, 20, 246, 470 * pr, 14, 7); g.fill();
    g.fillStyle = '#e6e9f2'; g.font = `700 14px ${MONO}`; g.fillText(`RENDER 1080x1920  ${Math.round(pr * 100)}%`, 20, 290);
    return;
  }
  screenChrome(g, 'ANALITIK  •  24 JAM', accent);
  g.fillStyle = '#e6e9f2'; g.font = `800 30px ${FONT}`; g.fillText('2,1 jt', 18, 68);
  g.fillStyle = '#7d8aa8'; g.font = `600 13px ${FONT}`; g.fillText('total views hari ini', 18, 94);
  g.fillStyle = '#4fd1a1'; g.font = `700 14px ${MONO}`; g.fillText('▲ 38%', 130, 68);
  const pts = []; const n = 22;
  for (let i = 0; i < n; i++) {
    const x = 18 + i * (300 / (n - 1));
    const y = 260 - (Math.pow(i / (n - 1), 1.6) * 120 + Math.sin(i * 1.3 + t) * 8 + 10);
    pts.push([x, y]);
  }
  const gr = g.createLinearGradient(0, 120, 0, 270);
  gr.addColorStop(0, 'rgba(79,209,161,0.45)'); gr.addColorStop(1, 'rgba(79,209,161,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(18, 270); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(318, 270); g.fill();
  g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  [['TikTok', 0.86, '#ff7aa2'], ['YouTube', 0.58, '#ff6b6b'], ['Facebook', 0.41, '#6cb8ff']].forEach(([p, v, c], i) => {
    const y = 120 + i * 50, vv = v * (0.95 + 0.05 * Math.sin(t * 2 + i));
    g.fillStyle = '#e6e9f2'; g.font = `600 13px ${FONT}`; g.fillText(p, 344, y);
    g.fillStyle = '#1d2540'; roundRect(g, 344, y + 10, 150, 10, 5); g.fill();
    g.fillStyle = c; roundRect(g, 344, y + 10, 150 * vv, 10, 5); g.fill();
  });
}

// ---------------------------------------------------------------- ruangan
function buildRoom() {
  const W = ROOM.x1 - ROOM.x0, D = ROOM.zFront - ROOM.zBack, zc = (ROOM.zBack + ROOM.zFront) / 2;
  add(box(W + 0.6, 0.5, D + 0.6), std('#14110f', 0.9), scene, 0, -0.25, zc, { cast: false });
  const floor = add(new THREE.PlaneGeometry(W, D), std('#ffffff', 0.5, 0, { map: woodFloorTex() }), scene, 0, 0.001, zc, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  const rug = add(new THREE.PlaneGeometry(13.2, 5.2), std('#ffffff', 0.96, 0, { map: rugTex() }), scene, 0, 0.012, 0.2, { cast: false });
  rug.rotation.x = -Math.PI / 2;

  const wt = wallTex();
  // dinding belakang dengan 2 lubang jendela
  const shape = new THREE.Shape();
  shape.moveTo(ROOM.x0, 0); shape.lineTo(ROOM.x1, 0); shape.lineTo(ROOM.x1, ROOM.h); shape.lineTo(ROOM.x0, ROOM.h); shape.closePath();
  const WIN = [[-8.1, -4.7], [4.7, 8.1]], WY = [1.25, 4.75];
  WIN.forEach(([a, b]) => {
    const hole = new THREE.Path();
    hole.moveTo(a, WY[0]); hole.lineTo(a, WY[1]); hole.lineTo(b, WY[1]); hole.lineTo(b, WY[0]); hole.closePath();
    shape.holes.push(hole);
  });
  const backTex = wt.clone(); backTex.repeat.set(0.25, 0.25); backTex.needsUpdate = true;
  add(new THREE.ShapeGeometry(shape), std('#ffffff', 0.92, 0, { map: backTex }), scene, 0, 0, ROOM.zBack, { cast: false });
  const frameMat = std('#1b1714', 0.55, 0.2);
  const shaftTex = canvasTex(64, 256, (g, ww, hh) => { const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, 'rgba(150,170,255,0.5)'); gr.addColorStop(1, 'rgba(150,170,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, ww, hh); });
  WIN.forEach(([a, b]) => {
    const cx = (a + b) / 2, w = b - a, hgt = WY[1] - WY[0], cy = (WY[0] + WY[1]) / 2;
    add(box(w + 0.3, 0.1, 0.5), std('#d8cbb4', 0.6), scene, cx, WY[0] - 0.03, ROOM.zBack + 0.1);
    add(box(w + 0.2, 0.1, 0.32), frameMat, scene, cx, WY[1] + 0.05, ROOM.zBack);
    add(box(0.1, hgt, 0.32), frameMat, scene, a - 0.05, cy, ROOM.zBack);
    add(box(0.1, hgt, 0.32), frameMat, scene, b + 0.05, cy, ROOM.zBack);
    for (let i = 1; i < 3; i++) add(box(0.05, hgt, 0.06), frameMat, scene, a + (w * i) / 3, cy, ROOM.zBack - 0.05, { cast: false });
    add(box(w, 0.05, 0.06), frameMat, scene, cx, WY[0] + hgt * 0.62, ROOM.zBack - 0.05, { cast: false });
    const glass = add(new THREE.PlaneGeometry(w, hgt), new THREE.MeshStandardMaterial({ color: '#8fb4ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false }), scene, cx, cy, ROOM.zBack - 0.06, { cast: false, receive: false });
    glass.renderOrder = 2;
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 5.5), new THREE.MeshBasicMaterial({
      map: shaftTex, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    shaft.position.set(cx, 2.1, ROOM.zBack + 1.8); shaft.rotation.x = -0.75;
    scene.add(shaft);
    for (let k = 0; k < 2; k++) succulent(scene, a + 0.5 + k * (w - 1), WY[0] + 0.02, ROOM.zBack + 0.18, 0.8);
  });
  // dinding samping (FrontSide: hanya terlihat dari dalam)
  const sideTex = wt.clone(); sideTex.repeat.set(D / 4, ROOM.h / 4); sideTex.needsUpdate = true;
  const sideMat = std('#ffffff', 0.92, 0, { map: sideTex });
  const sideGeo = new THREE.PlaneGeometry(D, ROOM.h);
  add(sideGeo, sideMat, scene, ROOM.x0, ROOM.h / 2, zc, { cast: false }).rotation.y = Math.PI / 2;
  add(sideGeo, sideMat, scene, ROOM.x1, ROOM.h / 2, zc, { cast: false }).rotation.y = -Math.PI / 2;
  // wainscot walnut + list kuningan
  const wain = std('#ffffff', 0.6, 0, { map: walnutTex() });
  const rail = std('#c8a26a', 0.35, 0.6);
  add(box(9.4, 1.05, 0.06), wain, scene, 0, 0.53, ROOM.zBack + 0.03, { cast: false });
  [-1, 1].forEach((s) => add(box(4.3, 1.2, 0.06), wain, scene, s * 6.85, 0.6, ROOM.zBack + 0.03, { cast: false }));
  add(box(9.4, 0.05, 0.1), rail, scene, 0, 1.07, ROOM.zBack + 0.05, { cast: false });
  [ROOM.x0, ROOM.x1].forEach((x) => {
    const s = Math.sign(-x);
    add(box(0.06, 1.05, D), wain, scene, x + s * 0.03, 0.53, zc, { cast: false });
    add(box(0.1, 0.05, D), rail, scene, x + s * 0.05, 1.07, zc, { cast: false });
  });
  const groove = std('#2b1a10', 0.8);
  for (let x = -4.2; x <= 4.2; x += 1.2) add(box(0.025, 0.85, 0.02), groove, scene, x, 0.53, ROOM.zBack + 0.07, { cast: false });

  // kota malam di luar jendela
  const city = new THREE.Mesh(new THREE.PlaneGeometry(44, 15), new THREE.MeshBasicMaterial({ map: cityTex(), toneMapped: false, fog: false }));
  city.position.set(0, 3, -15); scene.add(city);
  const moonHalo = glow('#fff2d6', 3.2, 0.8); moonHalo.position.set(9.6, 3.4, -14.5); moonHalo.material.fog = false; scene.add(moonHalo);
  const moonCore = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), new THREE.MeshBasicMaterial({ color: '#fff6e4', toneMapped: false, fog: false }));
  moonCore.position.set(9.6, 3.4, -14.4); scene.add(moonCore);
  const ct = cloudTex();
  for (let i = 0; i < 6; i++) {
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(R(5, 8), 2.2), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, opacity: R(0.5, 0.9), fog: false }));
    cl.position.set(R(-16, 16), R(2.4, 4.4), -13.5 + i * 0.1); scene.add(cl);
    const sp = R(0.08, 0.2);
    updaters.push((t, dt) => { cl.position.x += sp * dt; if (cl.position.x > 18) cl.position.x = -18; });
  }
  [[-10.5, 1.9], [-6.2, 2.4], [6.8, 2.1], [11.4, 1.6]].forEach(([x, y], i) => {
    const s = glow('#ff3b3b', 0.5, 0.9); s.position.set(x, y, -14.3); s.material.fog = false; scene.add(s);
    updaters.push((t) => { s.material.opacity = Math.sin(t * 2.2 + i * 1.7) > 0.6 ? 0.95 : 0.12; });
  });
}

function succulent(parent, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  add(cyl(0.11, 0.08, 0.16), std('#d9c7ad', 0.7), g, 0, 0.08, 0);
  add(cyl(0.1, 0.1, 0.02), std('#3a2a1e', 1), g, 0, 0.155, 0, { cast: false });
  const leaf = std('#5f9a6c', 0.6);
  for (let i = 0; i < 7; i++) {
    const l = add(sph(0.05, 10, 8), leaf, g, Math.cos(i) * 0.05, 0.2, Math.sin(i) * 0.05);
    l.scale.set(0.6, 1.6, 0.6); l.rotation.set(Math.sin(i) * 0.6, 0, Math.cos(i) * 0.6);
  }
  return g;
}
function bigPlant(x, z, s = 1, kind = 'monstera') {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  add(cyl(0.32, 0.24, 0.62, 28), std('#c96f4a', 0.75), g, 0, 0.31, 0);
  add(cyl(0.34, 0.34, 0.06, 28), std('#b45f3c', 0.75), g, 0, 0.6, 0);
  add(cyl(0.3, 0.3, 0.02), std('#2e2118', 1), g, 0, 0.62, 0, { cast: false });
  const leafMat = std('#3f7d4e', 0.55, 0, { side: THREE.DoubleSide });
  const leafMat2 = std('#2f6a3f', 0.55, 0, { side: THREE.DoubleSide });
  if (kind === 'snake') {
    for (let i = 0; i < 9; i++) {
      const hgt = R(0.8, 1.4);
      const geo = box(0.09, hgt, 0.015); geo.translate(0, hgt / 2, 0);
      const l = add(geo, i % 2 ? leafMat : leafMat2, g, R(-0.14, 0.14), 0.6, R(-0.14, 0.14));
      l.rotation.set(R(-0.2, 0.2), R(0, 3), R(-0.2, 0.2));
    }
  } else {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + R(-0.2, 0.2);
      const len = R(0.6, 1.1);
      const yaw = new THREE.Group(); yaw.position.y = 0.62; yaw.rotation.y = a; g.add(yaw);
      const pivot = new THREE.Group(); pivot.rotation.x = R(0.35, 0.8); yaw.add(pivot);
      add(cyl(0.012, 0.016, len, 6), leafMat2, pivot, 0, len / 2, 0);
      const leaf = add(sph(0.26, 14, 10), i % 2 ? leafMat : leafMat2, pivot, 0, len + 0.12, 0.08);
      leaf.scale.set(1, 0.1, 1.25); leaf.rotation.x = 0.5;
    }
  }
  const ph = R(0, 6);
  updaters.push((t) => { g.rotation.z = Math.sin(t * 0.6 + ph) * 0.012; });
  return g;
}

function buildDecor() {
  // ---- papan episode (Big Board)
  boardGroup = new THREE.Group(); boardGroup.position.set(0, 2.75, ROOM.zBack + 0.05); scene.add(boardGroup);
  const BW = 6.8, BH = 3.1;
  add(box(BW + 0.2, BH + 0.2, 0.08), std('#c8a26a', 0.35, 0.55), boardGroup, 0, 0, 0.0);
  const boardTex = canvasTex(1360, 620, (g, w, h) => {
    g.fillStyle = '#f7f5ef'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(120,130,150,${R(0.02, 0.05)})`; g.beginPath(); g.ellipse(R(0, w), R(0, h), R(60, 200), R(10, 40), R(0, 3), 0, Math.PI * 2); g.fill(); }
    const cw = w / 5;
    STAGE_ORDER.forEach((st, i) => {
      g.fillStyle = STAGE_COLORS[st]; roundRect(g, i * cw + 18, 18, cw - 36, 56, 12); g.fill();
      g.fillStyle = '#1b1d26'; g.font = `800 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(STAGE_TITLE[st], i * cw + cw / 2, 47);
      if (i) { g.strokeStyle = 'rgba(40,50,70,0.35)'; g.lineWidth = 3; g.setLineDash([14, 10]); g.beginPath(); g.moveTo(i * cw, 90); g.lineTo(i * cw, h - 20); g.stroke(); g.setLineDash([]); }
    });
  });
  add(new THREE.PlaneGeometry(BW, BH), std('#ffffff', 0.35, 0, { map: boardTex }), boardGroup, 0, 0, 0.045, { cast: false });
  add(box(BW * 0.6, 0.06, 0.14), std('#9aa3ad', 0.4, 0.7), boardGroup, 0, -BH / 2 - 0.08, 0.08);
  ['#e63946', '#1d4ed8', '#111827'].forEach((c, i) => {
    add(cyl(0.022, 0.022, 0.2, 10), std(c, 0.5), boardGroup, -0.4 + i * 0.3, -BH / 2 - 0.02, 0.1).rotation.z = Math.PI / 2;
  });
  noteGroup = new THREE.Group(); noteGroup.position.z = 0.06; boardGroup.add(noteGroup);

  // ---- neon nama studio
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 0.95), new THREE.MeshBasicMaterial({ map: neonTex(), transparent: true, toneMapped: false, depthWrite: false }));
  neon.position.set(0, 4.95, ROOM.zBack + 0.08); scene.add(neon);
  const neonGlow = glow('#ff5d8f', 6, 0.16); neonGlow.scale.set(7, 1.8, 1); neonGlow.position.set(0, 4.95, ROOM.zBack + 0.1); scene.add(neonGlow);
  const neonLight = new THREE.PointLight('#ff6f9c', 2.2, 6, 2); neonLight.position.set(0, 4.9, ROOM.zBack + 0.8); scene.add(neonLight);
  updaters.push((t) => { neon.material.opacity = 0.93 + Math.sin(t * 13) * 0.03 - (Math.sin(t * 0.7) > 0.995 ? 0.4 : 0); });

  // ---- dinding kiri: poster + jam + rak
  const L = ROOM.x0 + 0.04;
  ['a', 'b', 'c'].forEach((k, i) => {
    const fr = new THREE.Group(); fr.position.set(L, 2.6 + (i === 1 ? 0.25 : 0), -3.6 + i * 1.7); fr.rotation.y = Math.PI / 2; scene.add(fr);
    add(box(1.02, 1.4, 0.05), std('#16130f', 0.5, 0.2), fr, 0, 0, 0);
    add(new THREE.PlaneGeometry(0.9, 1.25), std('#ffffff', 0.6, 0, { map: posterTex(k) }), fr, 0, 0, 0.03, { cast: false });
  });
  const clockG = new THREE.Group(); clockG.position.set(L, 4.3, -1.9); clockG.rotation.y = Math.PI / 2; scene.add(clockG);
  add(cyl(0.42, 0.42, 0.07, 40), std('#c8a26a', 0.3, 0.8), clockG, 0, 0, 0).rotation.x = Math.PI / 2;
  add(new THREE.CircleGeometry(0.37, 40), std('#ffffff', 0.5, 0, { map: clockFaceTex() }), clockG, 0, 0, 0.04, { cast: false });
  const hand = (len, w, col, z) => { const p = new THREE.Group(); p.position.z = z; clockG.add(p); add(box(w, len, 0.01), std(col, 0.4), p, 0, len / 2 - 0.04, 0, { cast: false }); return p; };
  const hH = hand(0.2, 0.03, '#1e2433', 0.05), hM = hand(0.29, 0.02, '#1e2433', 0.055), hS = hand(0.31, 0.008, '#c0563f', 0.06);
  updaters.push(() => {
    const d = new Date(); const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    hS.rotation.z = -(s / 60) * Math.PI * 2; hM.rotation.z = -(m / 60) * Math.PI * 2; hH.rotation.z = -(h / 12) * Math.PI * 2;
  });
  shelf(L + 0.18, 2.4);

  // ---- dinding kanan: rak buku + stasiun kopi + papan ON AIR
  const Rx = ROOM.x1 - 0.04;
  bookcase(Rx - 0.32, -3.2);
  coffeeStation(Rx - 0.36, -0.2);
  const onAir = new THREE.Group(); onAir.position.set(Rx, 3.4, 1.9); onAir.rotation.y = -Math.PI / 2; scene.add(onAir);
  add(box(1.2, 0.42, 0.08), std('#16130f', 0.4, 0.3), onAir, 0, 0, 0);
  const onAirTex = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#2a0b10'; g.fillRect(0, 0, w, h); g.shadowBlur = 18; g.shadowColor = '#ff3b4d'; g.fillStyle = '#ff5263'; g.font = `900 54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ON AIR', w / 2, h / 2 + 2); });
  const onAirFace = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshBasicMaterial({ map: onAirTex, toneMapped: false }));
  onAirFace.position.z = 0.045; onAir.add(onAirFace);
  const onAirGlow = glow('#ff3b4d', 2.2, 0.25); onAirGlow.position.z = 0.1; onAir.add(onAirGlow);
  updaters.push((t) => { const on = Math.sin(t * 0.9) > -0.3; onAirFace.material.color.setScalar(on ? 1 : 0.35); onAirGlow.material.opacity = on ? 0.28 : 0.03; });

  // ---- tanaman + area santai
  bigPlant(-8.2, -4.7, 1.25, 'monstera');
  bigPlant(8.2, -4.75, 1.1, 'snake');
  bigPlant(-8.3, 3.9, 1.0, 'snake');
  bigPlant(8.3, 3.9, 1.15, 'monstera');
  sofa(-7.2, 1.9);
  const crate = std('#b48a5a', 0.85);
  add(box(0.6, 0.4, 0.45), crate, scene, 3.95, 0.2, -4.95).rotation.y = 0.2;
  add(box(0.5, 0.35, 0.4), crate, scene, 3.95, 0.58, -4.97).rotation.y = -0.15;
}
function shelf(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2; scene.add(g);
  const wood = std('#ffffff', 0.6, 0, { map: walnutTex(true) });
  add(box(1.9, 0.05, 0.32), wood, g, 0, 3.05, 0);
  for (let i = 0; i < 9; i++) {
    const bh = R(0.22, 0.34);
    const b = add(box(0.07, bh, 0.24), std(['#c0563f', '#2d4b73', '#d9a24a', '#e9dcc4', '#3f7d4e'][i % 5], 0.8), g, -0.85 + i * 0.085, 3.075 + bh / 2, 0);
    if (i === 8) b.rotation.z = 0.35;
  }
  const hang = succulent(g, 0.55, 3.075, 0, 1.2);
  const vine = std('#3f7d4e', 0.6);
  for (let i = 0; i < 9; i++) add(sph(0.045, 8, 6), vine, hang, 0.08 + Math.sin(i) * 0.03, 0.1 - i * 0.09, 0.08).scale.set(1.2, 0.6, 1);
}
function bookcase(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -Math.PI / 2; scene.add(g);
  const wood = std('#ffffff', 0.6, 0, { map: walnutTex() });
  const W = 2.2, H = 3.4, D = 0.55;
  add(box(W, 0.06, D), wood, g, 0, H, 0); add(box(W, 0.08, D), wood, g, 0, 0.04, 0);
  add(box(0.06, H, D), wood, g, -W / 2, H / 2, 0); add(box(0.06, H, D), wood, g, W / 2, H / 2, 0);
  add(box(W, H, 0.03), std('#2a1d14', 0.9), g, 0, H / 2, -D / 2 + 0.015);
  const cols = ['#c0563f', '#2d4b73', '#d9a24a', '#e9dcc4', '#3f7d4e', '#7d3cff', '#1b1d26', '#ff7aa2'];
  const bookMats = cols.map((c) => std(c, 0.75));
  for (let s = 0; s < 5; s++) {
    const y = 0.08 + s * 0.68;
    add(box(W - 0.06, 0.04, D - 0.04), wood, g, 0, y, 0);
    let bx = -W / 2 + 0.1;
    while (bx < W / 2 - 0.15) {
      if (rand() < 0.12) { bx += 0.25; continue; }
      const bw = R(0.05, 0.11), bh = R(0.36, 0.56);
      const b = add(box(bw, bh, R(0.3, 0.42)), bookMats[(rand() * cols.length) | 0], g, bx + bw / 2, y + 0.02 + bh / 2, 0.02);
      if (rand() < 0.08) { b.rotation.z = -0.3; b.position.x += 0.05; }
      bx += bw + 0.006;
    }
  }
  add(cyl(0.05, 0.08, 0.06, 16), std('#d9a24a', 0.25, 0.9), g, 0.6, 3.46, 0);
  add(sph(0.08, 16, 12), std('#d9a24a', 0.25, 0.9), g, 0.6, 3.56, 0);
}
function coffeeStation(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -Math.PI / 2; scene.add(g);
  const wood = std('#ffffff', 0.55, 0, { map: walnutTex(true) });
  add(box(1.6, 0.9, 0.6), std('#22303a', 0.7), g, 0, 0.45, 0);
  add(box(1.66, 0.05, 0.64), wood, g, 0, 0.925, 0);
  for (let i = 0; i < 2; i++) add(box(0.02, 0.6, 0.01), std('#c8a26a', 0.3, 0.8), g, -0.2 + i * 0.4, 0.5, 0.305);
  const mBody = std('#2a2c31', 0.35, 0.6), chrome = std('#d6d9de', 0.15, 1);
  add(box(0.42, 0.5, 0.36), mBody, g, -0.35, 1.2, -0.02);
  add(box(0.36, 0.06, 0.2), chrome, g, -0.35, 1.35, 0.17);
  add(cyl(0.03, 0.03, 0.1, 10), chrome, g, -0.35, 1.28, 0.2);
  mug(g, -0.35, 0.95, 0.16, '#f4efe6', true);
  const led = new THREE.Mesh(sph(0.015, 8, 6), new THREE.MeshBasicMaterial({ color: '#4fd1a1', toneMapped: false })); led.position.set(-0.22, 1.4, 0.16); g.add(led);
  add(cyl(0.08, 0.08, 0.22, 20), new THREE.MeshStandardMaterial({ color: '#c9b49a', roughness: 0.1, transparent: true, opacity: 0.55 }), g, 0.1, 1.06, 0);
  add(cyl(0.075, 0.075, 0.12, 20), std('#4a2c1a', 0.9), g, 0.1, 1.01, 0);
  for (let i = 0; i < 3; i++) mug(g, 0.38 + i * 0.16, 0.95, -0.1 + (i % 2) * 0.12, ['#ff7aa2', '#6cb8ff', '#ffc857'][i], false);
  succulent(g, 0.62, 0.95, 0.15, 0.9);
}
function sofa(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2 + 0.25; scene.add(g);
  const fab = std('#c0563f', 0.95), fabD = std('#a8492f', 0.95), brass = std('#c8a26a', 0.3, 0.8);
  add(box(2.1, 0.32, 0.85), fab, g, 0, 0.3, 0);
  add(box(2.1, 0.6, 0.22), fabD, g, 0, 0.7, -0.33);
  [-1, 1].forEach((s) => add(box(0.2, 0.5, 0.85), fabD, g, s * 1.0, 0.45, 0));
  [-0.5, 0.5].forEach((s) => add(box(0.92, 0.14, 0.68), fab, g, s, 0.52, 0.05));
  for (const sx of [-0.95, 0.95]) for (const sz of [-0.35, 0.35]) add(cyl(0.03, 0.02, 0.14, 8), brass, g, sx, 0.07, sz);
  add(box(0.42, 0.38, 0.12), std('#ffc857', 0.9), g, -0.62, 0.78, -0.16).rotation.set(-0.2, 0.2, 0.15);
  const t = new THREE.Group(); t.position.set(x + 1.3, 0, z - 0.25); scene.add(t);
  add(cyl(0.42, 0.42, 0.05, 32), std('#ffffff', 0.4, 0, { map: walnutTex(true) }), t, 0, 0.45, 0);
  add(cyl(0.03, 0.03, 0.45, 10), brass, t, 0, 0.22, 0);
  add(cyl(0.22, 0.25, 0.02, 24), brass, t, 0, 0.01, 0);
  for (let i = 0; i < 3; i++) add(box(0.3, 0.02, 0.22), std(['#6cb8ff', '#ff7aa2', '#e9dcc4'][i], 0.8), t, R(-0.05, 0.05), 0.485 + i * 0.022, R(-0.05, 0.05)).rotation.y = R(-0.5, 0.5);
}
function mug(parent, x, y, z, color, steam = true) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const m = std(color, 0.35);
  add(cyl(0.055, 0.05, 0.11, 20), m, g, 0, 0.055, 0);
  add(cyl(0.047, 0.047, 0.005, 20), std('#3b2314', 0.3), g, 0, 0.108, 0, { cast: false });
  add(new THREE.TorusGeometry(0.03, 0.009, 8, 16), m, g, 0.06, 0.055, 0);
  if (steam) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      s.scale.set(0.08, 0.08, 1); g.add(s);
      (sink ? sink.steam : steamSprites).push({ s, ph: i / 4, seed: rand() * 6 });
    }
  }
  return g;
}
function paperStack(parent, x, y, z, n = 6) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const a = std('#f4f1ea', 0.9), b = std('#e8e2d4', 0.9);
  for (let i = 0; i < n; i++) {
    add(box(0.3, 0.008, 0.4), i % 3 ? a : b, g, R(-0.015, 0.015), 0.004 + i * 0.009, R(-0.015, 0.015)).rotation.y = R(-0.12, 0.12);
  }
  return g;
}

// ---------------------------------------------------------------- lampu gantung kuningan
function pendant(parent, x, z, color = '#ffd29a', cordLen = 1.55, intensity = 15) {
  const g = new THREE.Group(); g.position.set(x, ROOM.h + 1.0, z); parent.add(g);
  add(cyl(0.008, 0.008, cordLen, 6), std('#111', 0.6), g, 0, -cordLen / 2, 0, { cast: false });
  const brass = std('#c8a26a', 0.32, 0.85, { side: THREE.DoubleSide });
  const shade = add(new THREE.CylinderGeometry(0.07, 0.34, 0.32, 32, 1, true), brass, g, 0, -cordLen - 0.12, 0, { cast: false });
  add(cyl(0.075, 0.075, 0.06, 16), brass, g, 0, -cordLen + 0.06, 0, { cast: false });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.335, 0.315, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#ffcf8a', side: THREE.BackSide, toneMapped: false }));
  inner.position.y = shade.position.y; g.add(inner);
  const bulb = new THREE.Mesh(sph(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff1d0', toneMapped: false }));
  bulb.position.y = -cordLen - 0.22; g.add(bulb);
  const halo = glow(color, 1.6, 0.5); halo.position.y = -cordLen - 0.3; g.add(halo);
  // jumlah PointLight dibatasi (biaya shader naik per lampu); lampu tanpa PointLight tetap menyala visual
  if (intensity > 0) {
    const light = new THREE.PointLight(color, intensity, 13, 1.5);
    light.position.y = -cordLen - 0.35; g.add(light);
  }
  const ph = R(0, 6);
  onFrame((t) => { g.rotation.z = Math.sin(t * 0.5 + ph) * 0.015; g.rotation.x = Math.cos(t * 0.43 + ph) * 0.012; });
  return g;
}

// ---------------------------------------------------------------- karakter
// Karakter Muse asli (gambar plush duduk di kursi gaming) sebagai sprite billboard.
// Tekstur dimuat per warna dan di-cache; rig dummy menjaga animateCharacters tetap jalan.
const seatTexCache = new Map();
function seatTexture(src) {
  if (!seatTexCache.has(src)) {
    const tex = new THREE.TextureLoader().load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    seatTexCache.set(src, tex);
  }
  return seatTexCache.get(src);
}
const SEAT_ASPECT = 0.411; // crop duduk 384x935
function buildCharacter(desk, parent) {
  const char = new THREE.Group(); parent.add(char);
  const seatSrc = (desk.photo || 'assets/chars/muse-hijau.png').replace('muse-', 'muse-seat-');
  const H = 1.85, W = H * SEAT_ASPECT;
  const body = new THREE.Group(); body.position.set(0, 0.55, -0.05); char.add(body);
  const torso = new THREE.Group(); torso.position.set(0, 0.375, 0.05); body.add(torso);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: seatTexture(seatSrc), transparent: true, depthWrite: false }));
  sprite.scale.set(W, H, 1);
  torso.add(sprite);
  // bidang transparan supaya karakter tetap bisa diklik (pilih meja)
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  torso.add(hit);
  const head = new THREE.Group(); torso.add(head);
  const mkArm = () => { const sh = new THREE.Group(); const elbow = new THREE.Group(); sh.add(elbow); return { sh, elbow }; };
  const rig = {
    body, torso, head,
    arms: [mkArm(), mkArm()],
    eyes: [new THREE.Group(), new THREE.Group()],
    phase: rand() * 10,
    nextLook: 2 + rand() * 4, lookT: 0, lookDir: 0,
    nextBlink: 1 + rand() * 3,
  };
  return { char, rig };
}
// ---------------------------------------------------------------- meja kerja
function buildDesk(desk, i, spot) {
  const { x, z, s } = spot;
  const g = new THREE.Group(); g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(HOME.pos.x - x, HOME.pos.z - z) * 0.85;
  g.scale.setScalar(s);
  deskLayer.group.add(g);
  desk.color3 = new THREE.Color(desk.css);
  // meja kiri/tengah: monitor di kanan; meja kanan: monitor di kiri (menghadap ke tengah ruangan)
  const side = x <= 0.01 ? 1 : -1;

  // cincin sorot + kolam cahaya di lantai
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.4, 64), new THREE.MeshBasicMaterial({ color: desk.css, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.02, -0.25); g.add(ring);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshBasicMaterial({ map: glowTex(), color: desk.css, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.018, -0.25); g.add(pool);

  // meja walnut + kaki baja
  add(box(2.1, 0.06, 1.0), std('#ffffff', 0.45, 0, { map: walnutTex(true) }), g, 0, 0.76, 0);
  const steel = std('#20242b', 0.45, 0.7);
  for (const sx of [-0.98, 0.98]) {
    add(box(0.05, 0.73, 0.05), steel, g, sx, 0.365, 0.42);
    add(box(0.05, 0.73, 0.05), steel, g, sx, 0.365, -0.42);
    add(box(0.05, 0.05, 0.9), steel, g, sx, 0.03, 0);
  }
  add(box(1.9, 0.5, 0.03), std('#ffffff', 0.6, 0, { map: walnutTex() }), g, 0, 0.47, 0.44);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), new THREE.MeshStandardMaterial({ map: nameplateTex(desk), roughness: 0.4, metalness: 0.2 }));
  plate.position.set(0, 0.5, 0.458); g.add(plate);
  add(box(0.45, 0.32, 0.8), std('#2a2f3a', 0.6, 0.3), g, -side * 0.7, 0.55, -0.05);

  // laptop (menghadap karakter, logo menghadap kamera)
  const lap = new THREE.Group(); lap.position.set(-side * 0.05, 0.79, -0.3); g.add(lap);
  const alu = std('#c7ccd3', 0.3, 0.85);
  add(box(0.5, 0.02, 0.34), alu, lap, 0, 0, 0);
  add(box(0.44, 0.004, 0.16), std('#2a2d33', 0.6), lap, 0, 0.012, -0.04, { cast: false });
  const lid = new THREE.Group(); lid.position.set(0, 0.01, 0.17); lap.add(lid);
  add(box(0.5, 0.32, 0.015), alu, lid, 0, 0.16, 0);
  lid.rotation.x = 0.22;
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshBasicMaterial({ color: desk.css, toneMapped: false }));
  logo.position.set(0, 0.16, 0.009); lid.add(logo);
  const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28), new THREE.MeshBasicMaterial({ color: '#9fb8ff', toneMapped: false }));
  lapScreen.position.set(0, 0.16, -0.009); lapScreen.rotation.y = Math.PI; lid.add(lapScreen);

  // monitor samping — isi layar sesuai peran
  const mon = new THREE.Group(); mon.position.set(side * 0.62, 0.79, -0.22); mon.rotation.y = -side * 0.42; g.add(mon);
  const dark = std('#14161b', 0.4, 0.5);
  add(cyl(0.12, 0.14, 0.02, 24), dark, mon, 0, 0.01, 0);
  add(box(0.05, 0.32, 0.03), dark, mon, 0, 0.17, -0.02);
  add(box(0.98, 0.6, 0.04), dark, mon, 0, 0.6, 0);
  const sc = canvasTex(SCREEN_W, SCREEN_H, (gg) => drawScreen(desk.screen, gg, 0, desk.css));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.54), new THREE.MeshBasicMaterial({ map: sc, toneMapped: false, color: '#e8e8e8' }));
  screen.position.set(0, 0.6, 0.021); mon.add(screen);
  const scrGlow = glow(desk.css, 1.5, 0.12); scrGlow.position.set(0, 0.6, 0.12); mon.add(scrGlow);
  let mLight = null;
  if (i < MAX_DESK_LIGHTS) { mLight = new THREE.PointLight(desk.css, 1.5, 2.6, 2); mLight.position.set(0, 0.6, 0.35); mon.add(mLight); }

  // mug, kertas, prop
  const ps = -side;
  mug(g, ps * 0.88, 0.79, 0.22, desk.mug);
  paperStack(g, ps * 0.5, 0.79, 0.12, 4 + (i % 3) * 2);
  buildProp(desk, g, ps);

  const { char, rig } = buildCharacter(desk, g);
  char.position.set(0, 0, -0.82);

  g.traverse((o) => { if (o.isMesh) { o.userData.deskId = desk.id; pickables.push(o); } });

  const label = document.createElement('button');
  label.type = 'button'; label.className = 'desk-label';
  label.style.setProperty('--c', desk.css);
  label.dataset.desk = desk.id;
  label.setAttribute('aria-label', `Buka detail ${desk.name}`);
  label.innerHTML = `<i aria-hidden="true">${desk.photo ? `<img src="${escHtml(desk.photo)}" alt="">` : escHtml(desk.avatar)}</i><span><b>${escHtml(desk.name)}</b><em data-q>standby</em></span>`;
  label.addEventListener('click', (e) => { e.stopPropagation(); selectDesk(desk.id); });
  label.addEventListener('pointerenter', () => setHover(desk.id));
  label.addEventListener('pointerleave', () => setHover(null));
  labelsEl.appendChild(label);

  desks[desk.id] = { desk, group: g, rig, ring, pool, label, screenTex: sc, mLight, side, anchor: new THREE.Vector3(0, 2.0, -0.82), queue: 0 };
}

function buildProp(desk, g, s) {
  const c = desk.color3;
  if (desk.prop === 'phone') {
    const tp = new THREE.Group(); tp.position.set(s * 0.22, 0.79, 0.25); tp.rotation.y = s * 0.3; g.add(tp);
    const m = std('#1e2129', 0.4, 0.5);
    for (let k = 0; k < 3; k++) { const l = add(cyl(0.006, 0.006, 0.14, 6), m, tp, Math.sin(k * 2.1) * 0.03, 0.06, Math.cos(k * 2.1) * 0.03); l.rotation.set(Math.cos(k * 2.1) * 0.4, 0, -Math.sin(k * 2.1) * 0.4); }
    add(box(0.09, 0.17, 0.01), m, tp, 0, 0.22, 0);
    const pt = canvasTex(90, 170, (gg, w, h) => { const gr = gg.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff7aa2'); gr.addColorStop(1, '#7d3cff'); gg.fillStyle = gr; gg.fillRect(0, 0, w, h); gg.fillStyle = '#fff'; gg.font = `800 14px ${FONT}`; gg.fillText('FYP', 8, 22); gg.beginPath(); gg.arc(w / 2, h / 2, 22, 0, Math.PI * 2); gg.fill(); for (let k = 0; k < 3; k++) gg.fillRect(w - 16, 90 + k * 22, 10, 10); });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.16), new THREE.MeshBasicMaterial({ map: pt, toneMapped: false }));
    scr.position.set(0, 0.22, 0.006); tp.add(scr);
    const mg = new THREE.Group(); mg.position.set(s * 0.75, 0.8, -0.25); mg.rotation.set(-Math.PI / 2, 0, 0.6); g.add(mg);
    add(new THREE.TorusGeometry(0.065, 0.012, 8, 24), std('#c8a26a', 0.3, 0.85), mg, 0, 0, 0);
    add(new THREE.CircleGeometry(0.062, 24), new THREE.MeshStandardMaterial({ color: '#cfe4ff', roughness: 0.05, transparent: true, opacity: 0.3 }), mg, 0, 0, 0);
    add(cyl(0.014, 0.014, 0.14, 8), std('#3b2314', 0.6), mg, 0, -0.13, 0);
  } else if (desk.prop === 'papers') {
    const lamp = new THREE.Group(); lamp.position.set(s * 0.82, 0.79, -0.3); g.add(lamp);
    const lm = std(c, 0.45, 0.3);
    add(cyl(0.09, 0.1, 0.03, 20), lm, lamp, 0, 0.015, 0);
    add(cyl(0.01, 0.01, 0.4, 8), std('#c8a26a', 0.3, 0.8), lamp, 0, 0.2, 0.05).rotation.x = 0.3;
    add(new THREE.ConeGeometry(0.08, 0.14, 20, 1, true), std(c, 0.45, 0.3, { side: THREE.DoubleSide }), lamp, 0, 0.4, 0.16).rotation.x = 0.6;
    const bulb = new THREE.Mesh(sph(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff1d0', toneMapped: false })); bulb.position.set(0, 0.37, 0.18); lamp.add(bulb);
    const lg = glow('#ffd29a', 0.7, 0.55); lg.position.set(0, 0.35, 0.2); lamp.add(lg);
    add(cyl(0.045, 0.045, 0.11, 16), std('#2f3a56', 0.6), g, s * 0.25, 0.845, 0.3);
    ['#ffc857', '#e63946', '#1d4ed8'].forEach((col, k) => { add(cyl(0.006, 0.006, 0.16, 6), std(col, 0.6), g, s * 0.25 + (k - 1) * 0.015, 0.92, 0.3).rotation.z = (k - 1) * 0.2; });
    add(box(0.34, 0.012, 0.24), std('#f4f1ea', 0.9), g, s * 0.2, 0.795, 0.05).rotation.y = 0.2;
  } else if (desk.prop === 'mic') {
    const m = std('#1e2129', 0.35, 0.6);
    const base = new THREE.Group(); base.position.set(s * 0.7, 0.79, -0.32); g.add(base);
    add(cyl(0.04, 0.05, 0.06, 12), m, base, 0, 0.03, 0);
    add(cyl(0.012, 0.012, 0.5, 8), m, base, -s * 0.07, 0.3, 0).rotation.z = s * 0.3;
    const tip = new THREE.Group(); tip.position.set(-s * 0.15, 0.54, 0); base.add(tip);
    add(cyl(0.012, 0.012, 0.45, 8), m, tip, -s * 0.2, 0.0, -0.03).rotation.z = Math.PI / 2;
    const mic = new THREE.Group(); mic.position.set(-s * 0.42, -0.06, -0.05); tip.add(mic);
    add(cyl(0.04, 0.04, 0.16, 16), std('#2a2d33', 0.3, 0.7), mic, 0, 0, 0);
    add(sph(0.045, 16, 12), std('#9aa0a8', 0.5, 0.8), mic, 0, 0.09, 0);
    add(new THREE.CircleGeometry(0.09, 24), new THREE.MeshStandardMaterial({ color: '#111', transparent: true, opacity: 0.35, side: THREE.DoubleSide }), mic, 0, 0.08, -0.12, { cast: false });
    add(new THREE.TorusGeometry(0.09, 0.008, 6, 24), m, mic, 0, 0.08, -0.12);
  } else if (desk.prop === 'clapper') {
    const cl = new THREE.Group(); cl.position.set(s * 0.22, 0.79, 0.24); cl.rotation.y = s * -0.4; g.add(cl);
    const ct = canvasTex(256, 180, (gg, w, h) => { gg.fillStyle = '#1b1d26'; gg.fillRect(0, 0, w, h); gg.strokeStyle = '#f4efe6'; gg.lineWidth = 3; for (let k = 0; k < 3; k++) { gg.beginPath(); gg.moveTo(10, 50 + k * 42); gg.lineTo(w - 10, 50 + k * 42); gg.stroke(); } gg.fillStyle = '#f4efe6'; gg.font = `700 22px ${FONT}`; gg.fillText('EP. 01', 16, 40); gg.fillText('SCENE 3  TAKE 2', 16, 84); gg.fillText('SKP', 16, 128); });
    add(box(0.26, 0.18, 0.02), std('#ffffff', 0.6, 0, { map: ct }), cl, 0, 0.09, 0).rotation.x = -0.25;
    const stick = canvasTex(256, 32, (gg, w, h) => { for (let k = 0; k < 8; k++) { gg.fillStyle = k % 2 ? '#f4efe6' : '#1b1d26'; gg.beginPath(); gg.moveTo(k * 36, 0); gg.lineTo(k * 36 + 36, 0); gg.lineTo(k * 36 + 20, h); gg.lineTo(k * 36 - 16, h); gg.fill(); } });
    add(box(0.27, 0.035, 0.022), std('#ffffff', 0.6, 0, { map: stick }), cl, 0, 0.2, 0.03).rotation.set(-0.25, 0, 0.25);
    add(box(0.12, 0.03, 0.18), std('#2a2d33', 0.4, 0.5), g, s * 0.78, 0.805, -0.3);
    const led = new THREE.Mesh(sph(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: '#4fd1a1', toneMapped: false }));
    led.position.set(s * 0.78, 0.82, -0.21); g.add(led);
    onFrame((t) => { led.material.color.set(Math.sin(t * 9) > 0 ? '#4fd1a1' : '#112233'); });
  } else if (desk.prop === 'rocket') {
    const rk = new THREE.Group(); rk.position.set(s * 0.22, 0.79, 0.26); g.add(rk);
    add(cyl(0.06, 0.07, 0.02, 16), std('#2a2d33', 0.4, 0.5), rk, 0, 0.01, 0);
    const body = new THREE.Group(); body.position.y = 0.05; rk.add(body);
    add(cyl(0.035, 0.035, 0.18, 16), std('#f4efe6', 0.4, 0.2), body, 0, 0.1, 0);
    add(new THREE.ConeGeometry(0.035, 0.08, 16), std('#e63946', 0.4), body, 0, 0.23, 0);
    add(sph(0.016, 10, 8), std('#6cb8ff', 0.1, 0.3), body, 0, 0.14, 0.03);
    for (let k = 0; k < 3; k++) add(box(0.004, 0.06, 0.04), std(c, 0.5), body, Math.sin(k * 2.1) * 0.04, 0.03, Math.cos(k * 2.1) * 0.04).rotation.y = k * 2.1;
    onFrame((t) => { body.position.y = 0.05 + Math.sin(t * 1.4) * 0.012; body.rotation.y = t * 0.6; });
    add(box(0.08, 0.15, 0.01), std('#1e2129', 0.4, 0.5), g, s * 0.75, 0.87, -0.2).rotation.set(-0.25, -s * 0.3, 0);
  }
}

// ---------------------------------------------------------------- lapisan meja (bangun / buang / bangun ulang)
const toDesk = (emp) => ({ ...emp, css: emp.color || STAGE_COLORS[emp.stage] || '#ffc857' });
function buildDeskLayer(list) {
  const layout = computeLayout(list.length);
  layoutInfo = layout;
  HOME.pos.copy(layout.home.pos); HOME.target.copy(layout.home.target);
  deskLayer = { group: new THREE.Group(), updaters: [], steam: [] };
  deskLayer.group.name = 'desk-layer';
  scene.add(deskLayer.group);
  sink = deskLayer;
  const prevRand = rand;
  try {
    // lampu gantung ikut layout: satu per meja, sedikit di depan meja. Baris belakang berada tepat di garis pandang
    // kamera HOME ke neon "STUDIO KARTUN PARODI" + papan episode, jadi lampu baris belakang di area tengah (|x| < 3)
    // tidak dipasang — meja itu tetap kena cahaya lampu baris depan + monitornya sendiri.
    const hangs = layout.spots.map((p, i) => ({ p, i })).filter(({ p }) => p.row === 0 || Math.abs(p.x) >= 3);
    // PointLight dibatasi & diprioritaskan untuk baris depan; intensitas diturunkan bila lampunya banyak
    const order = hangs.slice().sort((a, b) => a.p.row - b.p.row || Math.abs(a.p.x) - Math.abs(b.p.x));
    const lit = new Set(order.slice(0, MAX_PENDANT_LIGHTS).map((h) => h.i));
    const intensity = 15 * Math.min(1, Math.sqrt(5 / Math.max(1, lit.size)));
    rand = mulberry32(20261125 ^ list.length);
    hangs.forEach(({ p, i }) => {
      // lampu tengah digantung lebih tinggi (kabel pendek) supaya tidak menutupi neon dari kamera HOME
      const cord = p.row > 0 ? 1.3 : Math.abs(p.x) < 0.5 ? 1.05 : 1.55;
      pendant(deskLayer.group, p.x, p.z + 1.5 * p.s, '#ffd29a', cord, lit.has(i) ? intensity : 0);
    });
    list.forEach((emp, i) => {
      // seed acak per karyawan → tampilan meja/karakter sama setiap kali dibangun ulang / reload
      rand = mulberry32(seedOf(emp.id));
      const d = toDesk(emp);
      DESKS.push(d);
      buildDesk(d, i, layout.spots[i]);
    });
  } finally {
    rand = prevRand;
    sink = null;
  }
}
function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry && !o.isSprite) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    mats.forEach((m) => { if (m.map && !m.map.userData?.shared) m.map.dispose(); m.dispose(); });
    if (o.isLight) o.dispose?.();
  });
}
function clearDeskLayer() {
  Object.values(desks).forEach((d) => d.label.remove());
  for (const k of Object.keys(desks)) delete desks[k];
  for (let i = pickables.length - 1; i >= 0; i--) if (pickables[i].userData.deskId) pickables.splice(i, 1);
  DESKS.length = 0;
  if (!deskLayer) return;
  scene.remove(deskLayer.group);
  disposeObject(deskLayer.group);
  deskLayer = null;
}
// Bangun ulang semua meja dari daftar karyawan terbaru (dipanggil main.js setelah tambah/hapus karyawan).
export function rebuildDesks(list = []) {
  if (!scene) { DESKS.length = 0; list.forEach((e) => DESKS.push(toDesk(e))); return false; }
  clearDeskLayer();
  buildDeskLayer(list);
  if (hoverId && !desks[hoverId]) setHover(null);
  if (activeId && !desks[activeId]) setActiveDesk(null);
  else setActiveDesk(activeId);
  setDeskQueues(lastCounts);
  controls.maxDistance = Math.max(14, HOME.pos.distanceTo(HOME.target) + 1);
  resize();
  if (!activeId) { lastInteract = performance.now(); glideTo(HOME.pos, HOME.target, 900); }
  return true;
}

// ---------------------------------------------------------------- partikel debu
function buildDust() {
  const N = 260, pos = new Float32Array(N * 3), seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = R(-8, 8); pos[i * 3 + 1] = R(0.3, 5.5); pos[i * 3 + 2] = R(-5, 4);
    seeds[i] = rand() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex(), color: '#ffdcae', size: 0.06, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  scene.add(pts);
  updaters.push((t) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      a[i * 3] += Math.sin(t * 0.2 + seeds[i]) * 0.0016;
      a[i * 3 + 1] += 0.0018 + Math.sin(t * 0.5 + seeds[i]) * 0.0012;
      if (a[i * 3 + 1] > 5.6) a[i * 3 + 1] = 0.3;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- sticky notes 3D (sinkron data)
const noteTexCache = new Map();
function noteTex(ep) {
  const key = ep.id + '|' + ep.topic + '|' + ep.stage;
  if (noteTexCache.has(key)) return noteTexCache.get(key);
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = STAGE_COLORS[ep.stage]; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.15, 'rgba(0,0,0,0.1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1d26'; g.font = `800 30px ${FONT}`; g.textBaseline = 'top';
    wrapText(g, ep.topic, w - 36, 4).forEach((l, i) => g.fillText(l, 18, 40 + i * 36));
    g.font = `600 18px ${FONT}`; g.fillStyle = 'rgba(27,29,38,0.7)';
    g.fillText(String(ep.source || '').slice(0, 22), 18, h - 34);
  });
  noteTexCache.set(key, t);
  return t;
}
let lastNoteIds = null;
const noteEdge = {};
export function syncBoard(episodes = []) {
  if (!noteGroup) return;
  for (let i = pickables.length - 1; i >= 0; i--) if (pickables[i].userData.episodeId) pickables.splice(i, 1);
  noteGroup.clear();
  const BW = 6.8, cw = BW / 5, size = 0.5, max = 8;
  const fresh = [];
  STAGE_ORDER.forEach((st, ci) => {
    noteEdge[st] ??= std(STAGE_COLORS[st], 0.85);
    const list = episodes.filter((e) => e.stage === st);
    list.slice(0, max).forEach((ep, k) => {
      const col = k % 2, row = Math.floor(k / 2);
      const x = -BW / 2 + ci * cw + cw / 2 + (col ? 0.29 : -0.29);
      const y = 0.86 - row * 0.6;
      const r = mulberry32([...ep.id].reduce((a, ch) => a + ch.charCodeAt(0), 0));
      const n = new THREE.Group(); n.position.set(x, y, 0); n.rotation.z = (r() - 0.5) * 0.16;
      const e = noteEdge[st];
      const paper = add(box(size, size, 0.012), [e, e, e, e, new THREE.MeshStandardMaterial({ map: noteTex(ep), roughness: 0.85 }), e], n, 0, 0, 0.006);
      const pin = add(sph(0.03, 12, 8), std('#e63946', 0.3, 0.2), n, 0, size / 2 - 0.06, 0.03);
      [paper, pin].forEach((m) => { m.userData.episodeId = ep.id; pickables.push(m); });
      noteGroup.add(n);
      if (lastNoteIds && !lastNoteIds.has(ep.id)) fresh.push(n);
    });
    if (list.length > max) {
      const more = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#1b1d26'; roundRect(g, 0, 0, w, h, 24); g.fill(); g.fillStyle = '#fff'; g.font = `800 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+' + (list.length - max), w / 2, h / 2 + 2); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), new THREE.MeshBasicMaterial({ map: more, transparent: true }));
      m.position.set(-BW / 2 + ci * cw + cw / 2, -1.42, 0.02); noteGroup.add(m);
    }
  });
  fresh.forEach((n) => {
    n.scale.setScalar(0.01);
    animate(n.scale, { x: 1, y: 1, z: 1, duration: 800, ease: 'outElastic(1, .6)' });
  });
  lastNoteIds = new Set(episodes.map((e) => e.id));
}
export function setDeskQueues(counts = {}) {
  lastCounts = counts;
  Object.values(desks).forEach((d) => {
    const n = counts[d.desk.id] ?? 0;
    d.queue = n;
    d.label.querySelector('[data-q]').textContent = n ? `${n} episode antre` : 'standby';
    d.label.classList.toggle('busy', n > 0);
  });
}

// ---------------------------------------------------------------- interaksi
function setHover(id) {
  if (hoverId === id) return;
  hoverId = id;
  if (canvasEl) canvasEl.style.cursor = id ? 'pointer' : '';
  Object.values(desks).forEach((d) => d.label.classList.toggle('hover', d.desk.id === id));
}
export function setActiveDesk(id) {
  activeId = id;
  Object.values(desks).forEach((d) => d.label.classList.toggle('active', d.desk.id === id));
}
function selectDesk(id) {
  setActiveDesk(id);
  focusDesk(id);
  cb.onSelect?.(id);
}
function pick(ev) {
  const r = canvasEl.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData : null;
}
function glideTo(pos, target, dur = 1100) {
  gliding = true;
  const s = { px: camera.position.x, py: camera.position.y, pz: camera.position.z, tx: controls.target.x, ty: controls.target.y, tz: controls.target.z };
  animate(s, {
    px: pos.x, py: pos.y, pz: pos.z, tx: target.x, ty: target.y, tz: target.z,
    duration: reducedMotion ? 1 : dur, ease: 'inOutCubic',
    onUpdate: () => { camera.position.set(s.px, s.py, s.pz); controls.target.set(s.tx, s.ty, s.tz); },
    onComplete: () => { gliding = false; controls.update(); },
  });
}
export function focusDesk(id) {
  const d = desks[id]; if (!d || !camera) return;
  const g = d.group;
  g.updateMatrixWorld();
  const target = new THREE.Vector3(0, 1.15, -0.45).applyMatrix4(g.matrixWorld);
  const dir = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
  const k = 0.55 + 0.45 * g.scale.x; // meja yang diskala kecil (tim besar) → kamera mendekat secukupnya
  const dist = (camera.aspect < 1 ? 5.6 : 4.3) * k;
  const pos = target.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, 1.7 * k, 0));
  lastInteract = performance.now();
  glideTo(pos, target);
}
export function resetView() {
  if (!camera) return;
  setActiveDesk(null);
  lastInteract = performance.now();
  glideTo(HOME.pos, HOME.target);
}

// ---------------------------------------------------------------- animasi per frame
function animateCharacters(t, dt) {
  Object.values(desks).forEach((d) => {
    const r = d.rig, p = t + r.phase;
    const busy = d.queue > 0;
    r.body.position.y = 0.55 + Math.sin(p * 1.6) * 0.004;
    r.torso.scale.y = 1 + Math.sin(p * 1.6) * 0.012;
    const speed = busy ? 14 : 7;
    r.arms.forEach((a, k) => {
      const tap = Math.max(0, Math.sin(p * speed + k * Math.PI)) * (busy ? 0.12 : 0.06);
      a.elbow.rotation.x = -1.2 + tap;
      a.sh.rotation.x = -0.42 + tap * 0.3;
    });
    r.lookT += dt;
    if (r.lookT > r.nextLook) { r.lookT = 0; r.nextLook = 2.5 + Math.random() * 4; r.lookDir = r.lookDir ? 0 : 1; }
    const lookY = r.lookDir ? d.side * 0.55 : Math.sin(p * 0.4) * 0.12;
    r.head.rotation.y += (lookY - r.head.rotation.y) * Math.min(1, dt * 3);
    const nod = Math.sin(p * (busy ? 2.4 : 1.2)) * 0.05 + (r.lookDir ? -0.04 : 0.12);
    r.head.rotation.x += (nod - r.head.rotation.x) * Math.min(1, dt * 4);
    r.head.rotation.z = Math.sin(p * 0.7) * 0.03;
    r.nextBlink -= dt;
    const blink = r.nextBlink < 0.12 && r.nextBlink > 0 ? 0.1 : 1;
    if (r.nextBlink < 0) r.nextBlink = 2 + Math.random() * 4;
    r.eyes.forEach((e) => { e.scale.y = blink; });
    const hl = d.desk.id === activeId ? 1 : d.desk.id === hoverId ? 0.7 : 0;
    const k = Math.min(1, dt * 6);
    d.ring.material.opacity += (hl * 0.85 - d.ring.material.opacity) * k;
    d.pool.material.opacity += (hl * 0.32 + (busy ? 0.07 : 0) - d.pool.material.opacity) * k;
    if (d.mLight) d.mLight.intensity = 1.4 + Math.sin(t * 3 + r.phase) * 0.15;
  });
}
let screenIdx = 0, screenAcc = 0;
function updateScreens(t, dt) {
  screenAcc += dt;
  if (screenAcc < 0.07) return;
  screenAcc = 0;
  const list = Object.values(desks);
  if (!list.length) return;
  const d = list[screenIdx % list.length]; screenIdx++;
  drawScreen(d.desk.screen, d.screenTex.userData.ctx, t, d.desk.css);
  d.screenTex.needsUpdate = true;
}
function updateSteam(t) {
  const all = deskLayer ? steamSprites.concat(deskLayer.steam) : steamSprites;
  all.forEach((st) => {
    const k = (t * 0.35 + st.ph) % 1;
    st.s.position.set(Math.sin(t * 1.5 + st.seed + k * 4) * 0.025, 0.12 + k * 0.32, 0);
    const sc = 0.05 + k * 0.12; st.s.scale.set(sc, sc, 1);
    st.s.material.opacity = Math.sin(k * Math.PI) * 0.22;
  });
}
const tmpV = new THREE.Vector3();
const LABEL_MARGIN = 8, LABEL_GAP = 4;
function updateLabels() {
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  const placed = [];
  Object.values(desks).forEach((d) => {
    tmpV.copy(d.anchor).applyMatrix4(d.group.matrixWorld).project(camera);
    const ax = (tmpV.x * 0.5 + 0.5) * w, ay = (-tmpV.y * 0.5 + 0.5) * h;
    const lw = d.label.offsetWidth, lh = d.label.offsetHeight;
    // clamp horizontal: label tidak boleh keluar dari stage (margin LABEL_MARGIN)
    const x = Math.min(Math.max(ax, LABEL_MARGIN + lw / 2), w - LABEL_MARGIN - lw / 2);
    // hindari tumpang tindih: naikkan label bila menabrak label yang sudah ditempatkan
    let y = ay;
    for (let guard = 0; guard <= placed.length; guard++) {
      const hit = placed.find((p) => x - lw / 2 < p.r + LABEL_GAP && x + lw / 2 > p.l - LABEL_GAP && y - lh < p.b + LABEL_GAP && y > p.t - LABEL_GAP);
      if (!hit) break;
      y = hit.t - LABEL_GAP;
    }
    placed.push({ l: x - lw / 2, r: x + lw / 2, t: y - lh, b: y });
    // ekor panah tetap menunjuk ke meja walau label digeser ke samping
    d.label.style.setProperty('--ax', `${Math.max(-lw / 2 + 14, Math.min(lw / 2 - 14, ax - x)).toFixed(1)}px`);
    d.label.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    d.label.style.opacity = tmpV.z > 1 ? 0 : 1;
  });
}
function resize() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // jaga cakupan horizontal ±hHalf° — dihitung computeLayout() dari meja terluar di layout aktif (minimal 30.5°),
  // supaya semua meja selalu muat berapa pun jumlahnya (desktop lebar maupun HP tegak)
  const hHalf = layoutInfo ? layoutInfo.hHalf : 30.5;
  const v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hHalf)) / camera.aspect);
  camera.fov = Math.max(42, THREE.MathUtils.radToDeg(v));
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- init
export function initOffice(canvas, labels, callbacks = {}) {
  canvasEl = canvas; labelsEl = labels; cb = callbacks;
  stageEl = canvas.parentElement;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  rand = mulberry32(20261125);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  // Three r187: PCFSoftShadowMap sudah dihapus (memicu warning & otomatis jadi PCF).
  // PCFShadowMap di r187 sudah memakai sampling lembut — kelembutan diatur lewat shadow.radius.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0d16');
  scene.fog = new THREE.Fog('#0b0d16', 20, 38);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(42, 2, 0.1, 80);
  camera.position.copy(HOME.pos);

  // lighting berlapis: hemisphere + ambient + key (bayangan) + bulan + rim + point lights hangat
  scene.add(new THREE.HemisphereLight('#7f8cc4', '#3a2618', 0.55));
  scene.add(new THREE.AmbientLight('#ffe6c7', 0.12));
  const key = new THREE.DirectionalLight('#ffd9ae', 1.35);
  key.position.set(5, 11, 8); key.target.position.set(0, 0, -1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 9, bottom: -7, near: 1, far: 30 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 5;
  scene.add(key, key.target);
  const moon = new THREE.DirectionalLight('#8ea6ff', 0.55);
  moon.position.set(-4, 6, -14); moon.target.position.set(0, 0, 0);
  scene.add(moon, moon.target);
  const rim = new THREE.DirectionalLight('#ff9fbf', 0.25);
  rim.position.set(0, 5, -5); scene.add(rim);

  buildRoom();
  buildDecor();
  buildDust();
  // meja + lampu gantung dari daftar karyawan (callbacks.employees); layout & HOME dihitung dari jumlahnya
  buildDeskLayer(Array.isArray(callbacks.employees) ? callbacks.employees : []);
  camera.position.copy(HOME.pos);

  controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 5.5; controls.maxDistance = Math.max(14, HOME.pos.distanceTo(HOME.target) + 1);
  controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.36;
  controls.minAzimuthAngle = -0.65; controls.maxAzimuthAngle = 0.65;
  controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.7;
  controls.addEventListener('start', () => { lastInteract = performance.now(); controls.autoRotate = false; });
  controls.update();

  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return;
    const hit = pick(e);
    if (hit?.episodeId) cb.onSelectEpisode?.(hit.episodeId);
    else if (hit?.deskId) selectDesk(hit.deskId);
  });
  let hoverRaf = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons || hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const hit = pick(e);
      setHover(hit?.deskId ?? null);
      if (hit?.episodeId) canvas.style.cursor = 'pointer';
    });
  });
  canvas.addEventListener('pointerleave', () => setHover(null));

  new ResizeObserver(resize).observe(stageEl);
  resize();
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(stageEl);

  clock = new THREE.Clock();
  lastInteract = performance.now();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    const t = clock.elapsedTime;
    if (!reducedMotion) {
      updaters.forEach((f) => f(t, dt));
      deskLayer?.updaters.forEach((f) => f(t, dt));
      animateCharacters(t, dt);
      updateSteam(t);
      updateScreens(t, dt);
      const idle = performance.now() - lastInteract > 6000 && !gliding && !activeId;
      controls.autoRotate = idle;
      controls.autoRotateSpeed = 0.22 * Math.sin(t * 0.12);
    }
    if (!gliding) controls.update();
    renderer.render(scene, camera);
    updateLabels();
  });

  // hook kecil untuk uji otomatis: titik layar sebuah karakter/meja
  window.__office = {
    deskScreenPoint(id) {
      const d = desks[id]; if (!d) return null;
      const r = canvasEl.getBoundingClientRect();
      const v = new THREE.Vector3(0, 1.05, -0.62).applyMatrix4(d.group.matrixWorld).project(camera);
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    },
  };
  return true;
}
