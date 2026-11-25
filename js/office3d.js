// Studio Kartun Parodi — kantor 3D (Three.js), gaya visual Think Tank (Moongate):
// satu ruangan diorama, langit senja permanen, 5 meja + bust karakter,
// papan besar di dinding sebagai centrepiece, lampu kuningan hangat,
// blimp melayang, label HTML yang nempel di tiap meja.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { animate } from 'animejs';

// ---------- data karyawan (sinkron dengan main.js) ----------
export const DESKS = [
  { id: 'trend-hunter', name: 'Trend Hunter', color: 0x2dd4bf, css: '#2dd4bf', avatar: '🔎', x: -4.8, prop: 'magnifier',
    lines: ['TIKTOK FYP ▸ 12 video', 'X TRENDING ▸ #dasco', 'YOUTUBE SHORTS ▸ 8', 'IDE BARU: 3 ✓'] },
  { id: 'scriptwriter', name: 'Scriptwriter', color: 0xf59e0b, css: '#f59e0b', avatar: '✍️', x: -2.4, prop: 'glasses',
    lines: ['HOOK 3 DETIK ✓', 'DIALOG: Dasco...', 'PUNCHLINE ✓', 'CAPTION + JUDUL'] },
  { id: 'voiceover', name: 'Voiceover', color: 0xf472b6, css: '#f472b6', avatar: '🎙️', x: 0, prop: 'headphones',
    lines: ['NARASI 0:42 ▸ REC', 'KARAKTER A: ...', 'KARAKTER B: ...', 'AUDIO ✓ 48kHz'] },
  { id: 'editor', name: 'Editor', color: 0xa78bfa, css: '#a78bfa', avatar: '🎬', x: 2.4, prop: 'film',
    lines: ['REMOTION ▸ render', 'SUBTITLE ✓', '9:16 1080x1920', 'EXPORT 87% ▸'] },
  { id: 'publisher-analyst', name: 'Publisher + Analis', color: 0x4ade80, css: '#4ade80', avatar: '🚀', x: 4.8, prop: 'hat',
    lines: ['TIKTOK ✓ 15:04', 'FB REELS ✓', 'YOUTUBE ⏳', 'ANALITIK 20:00'] },
];
const STAGE_COLORS = { ide: 0xffcf6a, naskah: 0x8fc8ff, suara: 0xf6b4c6, edit: 0xb9a2d4, terbit: 0x9ff0b8 };
const DESK_Z = 0.6;

// ---------- state modul ----------
let renderer, scene, camera, controls, clock;
let canvasEl, labelsEl, onSelect;
let busts = [], monitors = [], steams = [], clouds = [], blimp, boardNotes, rackLeds = [];
let deskGroups = {};
let labelDivs = {}, activeDesk = null, gliding = false;
let reducedMotion = false;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const HOME = { pos: new THREE.Vector3(0.9, 3.2, 6.6), look: new THREE.Vector3(-0.3, 1.0, -3.5), fov: 52 };
const HOME_TALL = { pos: new THREE.Vector3(0.2, 3.5, 6.8), look: new THREE.Vector3(-0.1, 0.75, -4), fov: 66 };

// ---------- util ----------
function mat(color, rough = 0.85, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function box(w, h, d, material, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent = scene, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function sph(r, material, x = 0, y = 0, z = 0, parent = scene, ws = 20, hs = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
// langit senja (gradient Think Tank) + bintang, digambar sekali di canvas
function makeSkyTexture() {
  const W = 1024, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  for (const [o, c] of [[0, '#28307a'], [0.18, '#34419a'], [0.32, '#5a62bd'], [0.41, '#9c86d2'], [0.47, '#e39cc4'], [0.5, '#f6b4c6'], [0.53, '#d3a9d9'], [0.62, '#b9a2d4'], [1, '#9e8fc9']]) gr.addColorStop(o, c);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W, y = rnd() * H * 0.42, r = rnd() * 1.4 + 0.4;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function makeGlowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,201,130,0.9)'); g.addColorStop(0.4, 'rgba(255,201,130,0.35)'); g.addColorStop(1, 'rgba(255,201,130,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// ---------- karakter bust (kepala + bahu, ala thinker-bust) ----------
function makeBust(desk) {
  const g = new THREE.Group();
  const skin = mat(0xf2c9a0, 0.7);
  const shirt = mat(desk.color, 0.8);
  const hairColors = { 'trend-hunter': 0x3b2f2f, scriptwriter: 0x1f2937, voiceover: 0x6d28d9, editor: 0x111827, 'publisher-analyst': 0x78350f };
  // bahu
  const shoulders = sph(0.42, shirt, 0, 0.98, 0, g, 24, 16);
  shoulders.scale.set(1.15, 0.55, 0.75);
  // kepala
  sph(0.26, skin, 0, 1.38, 0, g);
  // rambut
  const hair = sph(0.27, mat(hairColors[desk.id] ?? 0x1f2937, 0.9), 0, 1.44, -0.03, g);
  hair.scale.set(1, 0.75, 1);
  // mata
  const eyeM = mat(0x1b1430, 0.4);
  sph(0.032, eyeM, -0.09, 1.4, 0.22, g, 8, 8);
  sph(0.032, eyeM, 0.09, 1.4, 0.22, g, 8, 8);
  // prop khas tiap peran
  if (desk.prop === 'magnifier') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 10, 24), mat(0xd4af37, 0.35, 0.7));
    ring.position.set(0.42, 1.05, 0.15); ring.rotation.set(0.2, 0.4, 0); ring.castShadow = true; g.add(ring);
    const handle = cyl(0.015, 0.015, 0.22, mat(0x6b4a2f, 0.7), 0.5, 0.92, 0.18, g, 8);
    handle.rotation.z = -0.6;
  } else if (desk.prop === 'glasses') {
    const gm = mat(0x1b1430, 0.3, 0.6);
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), gm);
      r.position.set(sx * 0.1, 1.4, 0.24); r.castShadow = true; g.add(r);
    }
    box(0.05, 0.012, 0.012, gm, 0, 1.42, 0.24, g);
    // pulpen + buku di meja depan
    const pen = cyl(0.012, 0.012, 0.2, mat(0xffcf6a, 0.5), 0.3, 0.82, 0.35, g, 8);
    pen.rotation.z = 0.5;
    box(0.3, 0.03, 0.22, mat(0xf4f0ff, 0.9), -0.28, 0.8, 0.32, g);
  } else if (desk.prop === 'headphones') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 10, 24, Math.PI), mat(0x1b1430, 0.5));
    band.position.set(0, 1.42, 0); band.castShadow = true; g.add(band);
    cyl(0.07, 0.07, 0.05, mat(0x1b1430, 0.5), -0.27, 1.36, 0, g, 14).rotation.z = Math.PI / 2;
    cyl(0.07, 0.07, 0.05, mat(0x1b1430, 0.5), 0.27, 1.36, 0, g, 14).rotation.z = Math.PI / 2;
    // mic di depan
    cyl(0.015, 0.015, 0.3, mat(0x374151, 0.4, 0.6), 0, 1.05, 0.3, g, 8).rotation.x = 0.5;
    sph(0.05, mat(0x1b1430, 0.8), 0, 1.18, 0.38, g, 12, 10);
  } else if (desk.prop === 'film') {
    const strip = box(0.36, 0.13, 0.02, mat(0x111827, 0.6), 0, 1.02, 0.3, g);
    strip.rotation.x = -0.25;
    for (let i = -1; i <= 1; i++) box(0.06, 0.07, 0.025, mat(0xf4f0ff, 0.7), i * 0.11, 1.02, 0.3, g).rotation.x = -0.25;
  } else if (desk.prop === 'hat') {
    cyl(0.2, 0.2, 0.13, mat(0x92400e, 0.85), 0, 1.6, 0, g, 20);
    cyl(0.32, 0.32, 0.02, mat(0x92400e, 0.85), 0, 1.55, 0, g, 20);
    // tablet di meja
    const tab = box(0.3, 0.02, 0.22, mat(0x1b1430, 0.4, 0.4), 0.3, 0.81, 0.3, g);
    tab.rotation.x = -0.15; tab.rotation.y = 0.3;
  }
  g.traverse((o) => { if (o.isMesh) o.userData.empId = desk.id; });
  return g;
}

// ---------- monitor CRT + layar mengetik ----------
function makeMonitor(desk, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const shell = mat(0x2b2350, 0.6);
  box(0.2, 0.04, 0.16, shell, 0, 0.8, 0, g); // alas
  box(0.52, 0.44, 0.1, shell, 0, 1.06, -0.02, g); // bodi CRT
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 176;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.3), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, 1.06, 0.035); g.add(screen);
  const pip = box(0.03, 0.02, 0.01, new THREE.MeshBasicMaterial({ color: 0x9ff0b8 }), 0.2, 0.86, 0.035, g);
  g.traverse((o) => { if (o.isMesh) o.userData.empId = desk.id; });
  scene.add(g);
  const mon = { group: g, canvas: cv, tex, lines: desk.lines, charIdx: 0, lineIdx: 0, hold: 0, pip, seed: Math.random() * 100 };
  drawScreen(mon);
  return mon;
}
function drawScreen(mon) {
  const ctx = mon.canvas.getContext('2d');
  ctx.fillStyle = '#0d0b26'; ctx.fillRect(0, 0, 256, 176);
  ctx.font = '13px monospace';
  mon.lines.forEach((ln, i) => {
    let txt = ln;
    if (i === mon.lineIdx) txt = ln.slice(0, mon.charIdx);
    else if (i > mon.lineIdx) txt = '';
    ctx.fillStyle = i === 0 ? '#ffcf6a' : '#b9e7ff';
    ctx.fillText(txt, 10, 28 + i * 32);
  });
  // kursor berkedip
  if (Math.floor(performance.now() / 450) % 2 === 0 && mon.lineIdx < mon.lines.length) {
    const w = ctx.measureText(mon.lines[mon.lineIdx].slice(0, mon.charIdx)).width;
    ctx.fillStyle = '#ffcf6a'; ctx.fillRect(12 + w, 16 + mon.lineIdx * 32, 8, 14);
  }
  mon.tex.needsUpdate = true;
}

// ---------- meja lengkap ----------
function makeDesk(desk) {
  const g = new THREE.Group();
  g.position.set(desk.x, 0, DESK_Z);
  const wood = mat(0x6b4a2f, 0.75);
  const woodDark = mat(0x4a3428, 0.8);
  box(1.7, 0.08, 0.9, wood, 0, 0.78, 0, g); // top
  box(0.08, 0.76, 0.85, woodDark, -0.78, 0.38, 0, g); // kaki kiri
  box(0.08, 0.76, 0.85, woodDark, 0.78, 0.38, 0, g); // kaki kanan
  box(1.5, 0.3, 0.06, woodDark, 0, 0.55, -0.4, g); // panel belakang
  // keyboard
  const kb = box(0.6, 0.03, 0.22, mat(0x1b1430, 0.5), 0, 0.84, 0.22, g);
  kb.rotation.x = -0.08;
  for (let i = 0; i < 5; i++) box(0.09, 0.012, 0.03, mat(0x8f86c4, 0.6), -0.2 + i * 0.1, 0.858, 0.22, g);
  // mug + uap
  cyl(0.06, 0.05, 0.12, mat(desk.color, 0.6), -0.62, 0.88, 0.15, g, 16);
  const steam = [];
  const glowTex = makeGlowTexture();
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    sp.position.set(desk.x - 0.62, 1.0, DESK_Z + 0.15);
    sp.scale.set(0.12, 0.12, 1);
    sp.userData = { phase: i / 3, baseX: desk.x - 0.62 };
    scene.add(sp); steam.push(sp);
  }
  steams.push(...steam);
  // lampu kuningan belakang-kanan
  cyl(0.07, 0.09, 0.03, mat(0xd4af37, 0.35, 0.8), 0.68, 0.84, -0.28, g, 16);
  cyl(0.015, 0.015, 0.3, mat(0xd4af37, 0.35, 0.8), 0.68, 0.99, -0.28, g, 8);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.12, 16, 1, true), mat(0xffc982, 0.5));
  shade.position.set(0.68, 1.16, -0.28); shade.castShadow = true; g.add(shade);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc982, transparent: true, opacity: 0.85, depthWrite: false }));
  glow.position.set(0.68, 1.12, -0.28); glow.scale.set(0.55, 0.55, 1); g.add(glow);
  const lampLight = new THREE.PointLight(0xffc982, 2.2, 2.6, 1.6);
  lampLight.position.set(0.68, 1.1, -0.28); g.add(lampLight);
  // tumpukan kertas
  box(0.28, 0.04, 0.2, mat(0xf4f0ff, 0.95), 0.55, 0.84, 0.25, g).rotation.y = 0.2;
  // lonceng kecil di meja pertama
  if (desk.id === 'trend-hunter') {
    const bell = sph(0.06, mat(0xd4af37, 0.3, 0.85), -0.35, 0.85, -0.25, g, 14, 10);
    bell.scale.y = 0.7;
    cyl(0.07, 0.07, 0.012, mat(0x1b1430, 0.5), -0.35, 0.82, -0.25, g, 14);
  }
  // kursi pedestal di belakang meja
  const chair = new THREE.Group();
  chair.position.set(0, 0, -0.85);
  cyl(0.26, 0.3, 0.04, mat(0x1b1430, 0.6), 0, 0.06, 0, chair, 18);
  cyl(0.03, 0.03, 0.4, mat(0x8f86c4, 0.4, 0.6), 0, 0.28, 0, chair, 10);
  box(0.5, 0.07, 0.48, mat(0x2b2350, 0.7), 0, 0.52, 0, chair);
  box(0.48, 0.55, 0.07, mat(0x2b2350, 0.7), 0, 0.85, -0.22, chair);
  g.add(chair);
  // bust karakter di kursi
  const bust = makeBust(desk);
  bust.position.set(0, 0, -0.85);
  g.add(bust);
  busts.push({ group: bust, phase: Math.random() * Math.PI * 2, id: desk.id });
  // ring aktif di lantai (muncul saat meja difokuskan)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32),
    new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.02, -0.1); ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;
  g.traverse((o) => { if (o.isMesh && !o.userData.empId) o.userData.empId = desk.id; });
  deskGroups[desk.id] = g;
  scene.add(g);
  return g;
}

// ---------- papan besar (centrepiece dinding belakang) ----------
function makeBoard() {
  const g = new THREE.Group();
  g.position.set(-1.2, 1.9, -4.35);
  g.rotation.y = 0.12;
  box(4.8, 2.5, 0.1, mat(0x3a2f1e, 0.7), 0, 0, 0, g); // bingkai
  const face = box(4.6, 2.3, 0.04, mat(0xf4f0ff, 0.95), 0, 0, 0.06, g); // permukaan putih
  face.castShadow = false;
  // strip judul
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1b1430'; ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#ffcf6a'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('PAPAN EPISODE', 256, 44);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.28), new THREE.MeshBasicMaterial({ map: tex }));
  strip.position.set(0, 1.0, 0.09); g.add(strip);
  // kolom tahap (garis tipis)
  for (let i = 1; i < 5; i++) {
    const x = -2.3 + i * 0.92;
    const ln = box(0.015, 1.7, 0.01, mat(0xb9b0dc, 0.9), x, -0.2, 0.085, g);
    ln.castShadow = false;
  }
  boardNotes = new THREE.Group();
  boardNotes.position.set(0, 0, 0.1);
  g.add(boardNotes);
  scene.add(g);
  return g;
}
export function syncBoard(episodes) {
  if (!boardNotes) return;
  while (boardNotes.children.length) {
    const c = boardNotes.children.pop();
    c.geometry?.dispose?.();
  }
  const stages = ['ide', 'naskah', 'suara', 'edit', 'terbit'];
  const perCol = { ide: 0, naskah: 0, suara: 0, edit: 0, terbit: 0 };
  episodes.slice(0, 20).forEach((ep, i) => {
    const col = stages.indexOf(ep.stage); if (col < 0) return;
    const row = perCol[ep.stage]++; if (row > 3) return;
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62),
      new THREE.MeshBasicMaterial({ color: STAGE_COLORS[ep.stage] ?? 0xffcf6a })
    );
    note.position.set(-1.84 + col * 0.92, 0.55 - row * 0.68, 0.02);
    note.rotation.z = ((i * 37) % 12 - 6) * Math.PI / 180;
    boardNotes.add(note);
  });
}

// ---------- rak server (pojok) + tanaman + karpet ----------
function makeServerRack() {
  const g = new THREE.Group();
  g.position.set(6.4, 0, -3.4);
  box(1.3, 2.3, 0.8, mat(0x14142a, 0.5, 0.3), 0, 1.15, 0, g);
  for (let r = 0; r < 6; r++) {
    box(1.1, 0.28, 0.04, mat(0x1e1e3a, 0.5), 0, 0.35 + r * 0.34, 0.42, g);
    for (let c = 0; c < 4; c++) {
      const led = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06),
        new THREE.MeshBasicMaterial({ color: [0x9ff0b8, 0xffcf6a, 0x8fc8ff, 0xff8a7a][(r + c) % 4] }));
      led.position.set(-0.4 + c * 0.22, 0.35 + r * 0.34, 0.45);
      g.add(led);
      rackLeds.push({ mesh: led, phase: (r * 4 + c) * 0.7 });
    }
  }
  scene.add(g);
}
function makePlant(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  cyl(0.22, 0.16, 0.35, mat(0x9c6644, 0.9), 0, 0.18, 0, g, 14);
  const leaf = mat(0x4d7c4d, 0.9);
  sph(0.3, leaf, 0, 0.6, 0, g, 10, 8);
  sph(0.22, leaf, 0.18, 0.8, 0.1, g, 10, 8);
  sph(0.2, leaf, -0.16, 0.82, -0.08, g, 10, 8);
  scene.add(g);
}

// ---------- awan + blimp ----------
function makeClouds() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const n = 3 + (i % 2);
    for (let j = 0; j < n; j++) {
      const s = sph(0.5 + Math.random() * 0.5, m, j * 0.7 - n * 0.35, Math.random() * 0.15, 0, g, 10, 8);
      s.scale.y = 0.45; s.castShadow = false;
    }
    g.position.set(-9 + i * 5.5, 4.6 + (i % 2) * 0.9, -6.2 - (i % 3) * 0.4);
    g.userData = { speed: 0.05 + i * 0.012 };
    scene.add(g); clouds.push(g);
  }
}
function makeBlimp() {
  const g = new THREE.Group();
  const body = sph(0.55, mat(0xffcf6a, 0.6), 0, 0, 0, g, 20, 14);
  body.scale.set(2.6, 1, 1);
  box(0.5, 0.3, 0.3, mat(0x1b1430, 0.6), 0, -0.55, 0, g);
  const finM = mat(0xe8a33d, 0.6);
  box(0.06, 0.5, 0.4, finM, -1.35, 0.15, 0, g);
  box(0.06, 0.4, 0.5, finM, -1.35, 0, 0, g).rotation.x = 0;
  g.position.set(-11, 5.4, -6.5);
  scene.add(g);
  blimp = g;
}

// ---------- ruangan ----------
// ---------- ruangan ----------
function buildRoom() {
  // lantai + karpet
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(17, 12), mat(0x4a3428, 0.9));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -0.5); floor.receiveShadow = true;
  scene.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 3.6), mat(0x7a2e3d, 0.95));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.015, 2.6); rug.receiveShadow = true;
  scene.add(rug);
  const rugIn = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 3.0), mat(0x9c4a5a, 0.95));
  rugIn.rotation.x = -Math.PI / 2; rugIn.position.set(0, 0.02, 2.6); rugIn.receiveShadow = true;
  scene.add(rugIn);
  // langit di belakang jendela
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(22, 10), new THREE.MeshBasicMaterial({ map: makeSkyTexture(), fog: false }));
  sky.position.set(0, 4.2, -8.5);
  scene.add(sky);
  // dinding belakang (dengan lubang jendela di kanan)
  const wallM = mat(0x2a2350, 0.95);
  box(5.4, 3.8, 0.25, wallM, -5.6, 1.9, -4.6);            // kiri (di belakang papan)
  box(3.4, 3.8, 0.25, wallM, 6.6, 1.9, -4.6);             // kanan
  box(4.6, 0.7, 0.25, wallM, 2.6, 3.45, -4.6);            // atas jendela
  box(4.6, 0.9, 0.25, wallM, 2.6, 0.45, -4.6);            // bawah jendela
  // bingkai jendela
  const frameM = mat(0x1b1430, 0.7);
  box(4.8, 0.1, 0.3, frameM, 2.6, 3.05, -4.6);
  box(4.8, 0.1, 0.3, frameM, 2.6, 0.95, -4.6);
  box(0.1, 2.2, 0.3, frameM, 0.25, 2.0, -4.6);
  box(0.1, 2.2, 0.3, frameM, 4.95, 2.0, -4.6);
  box(0.08, 2.1, 0.28, frameM, 2.6, 2.0, -4.6);
  // dinding samping rendah (diorama terbuka)
  box(0.25, 2.4, 11, wallM, -8.3, 1.2, -0.5);
  box(0.25, 2.4, 11, wallM, 8.3, 1.2, -0.5);
  // papan + meja + rak + tanaman + awan + blimp
  makeBoard();
  DESKS.forEach((d) => { makeDesk(d); monitors.push(makeMonitor(d, d.x, DESK_Z - 0.05)); });
  makeServerRack();
  makePlant(-7.4, -3.6, 1.15);
  makePlant(7.5, 0.6, 0.95);
  makeClouds();
  makeBlimp();
}

// ---------- label HTML mengambang ----------
function buildLabels() {
  labelsEl.innerHTML = '';
  labelDivs = {};
  DESKS.forEach((d) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lbl';
    el.textContent = `${d.avatar} ${d.name}`;
    el.addEventListener('click', () => focusDesk(d.id, true));
    labelsEl.appendChild(el);
    labelDivs[d.id] = el;
  });
}
const _v = new THREE.Vector3();
function updateLabels() {
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  DESKS.forEach((d, i) => {
    const el = labelDivs[d.id]; if (!el) return;
    const bust = busts[i];
    _v.set(d.x, 2.05, DESK_Z - 0.85).project(camera);
    if (_v.z > 1 || _v.z < -1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = ((_v.x * 0.5 + 0.5) * w) + 'px';
    el.style.top = ((-_v.y * 0.5 + 0.5) * h) + 'px';
    el.classList.toggle('hot', activeDesk === d.id || (busts[i] && busts[i].group.userData.busy));
  });
}

// ---------- kamera: tampilan composed + fokus meja ----------
function homeStop() {
  return (canvasEl.clientWidth / Math.max(1, canvasEl.clientHeight)) < 0.85 ? HOME_TALL : HOME;
}
function glideTo(pos, look, fov, secs = 0.9, done) {
  if (gliding) return;
  gliding = true;
  controls.enabled = false;
  const p0 = camera.position.clone(), l0 = controls.target.clone(), f0 = camera.fov;
  const st = { t: 0 };
  animate(st, {
    t: 1, duration: secs * 1000, ease: 'inOutQuad',
    onUpdate: () => {
      const e = st.t;
      camera.position.lerpVectors(p0, pos, e);
      controls.target.lerpVectors(l0, look, e);
      camera.fov = f0 + (fov - f0) * e;
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
    },
    onComplete: () => { gliding = false; controls.enabled = true; done?.(); },
  });
}
export function resetView() {
  const h = homeStop();
  glideTo(h.pos, h.look, h.fov, 0.9);
  setActiveDesk(null);
}
export function focusDesk(id, open = false) {
  const d = DESKS.find((x) => x.id === id); if (!d) return;
  const at = new THREE.Vector3(d.x, 1.0, DESK_Z - 0.4);
  const dir = camera.position.clone().sub(at); dir.y = 0;
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
  dir.normalize();
  const pos = at.clone().add(dir.multiplyScalar(3.1)).add(new THREE.Vector3(0, 1.5, 0));
  const look = at.clone().add(new THREE.Vector3(0, 0.15, 0));
  setActiveDesk(id);
  glideTo(pos, look, 46, 0.85, () => { if (open) onSelect?.(id); });
  if (!open) onSelect?.(id);
}
export function setActiveDesk(id) {
  activeDesk = id;
  Object.values(deskGroups).forEach((g) => { if (g.userData.ring) g.userData.ring.visible = false; });
  if (id && deskGroups[id]?.userData.ring) deskGroups[id].userData.ring.visible = true;
}

// ---------- klik meja (raycast, bedakan dari drag orbit) ----------
function bindPicking() {
  let downX = 0, downY = 0;
  canvasEl.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
  canvasEl.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const r = canvasEl.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      const id = h.object.userData.empId;
      if (id) { focusDesk(id, true); return; }
    }
  });
}

// ---------- init ----------
export function initOffice(canvas, labels, callbacks = {}) {
  canvasEl = canvas; labelsEl = labels; onSelect = callbacks.onSelect ?? null;
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b3168);
  scene.fog = new THREE.Fog(0xb9a2d4, 16, 34);

  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 11;
  controls.minPolarAngle = 0.95;
  controls.maxPolarAngle = 1.38;
  controls.minAzimuthAngle = -0.45;
  controls.maxAzimuthAngle = 0.45;
  controls.target.copy(HOME.look);

  // cahaya: ambient lavender + mauve, matahari pink senja
  scene.add(new THREE.HemisphereLight(0x8f86c4, 0x6d5470, 1.15));
  const sun = new THREE.DirectionalLight(0xffb0b8, 2.0);
  sun.position.set(-4, 6, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9c86d2, 0.5);
  fill.position.set(5, 4, -2);
  scene.add(fill);

  buildRoom();
  buildLabels();
  bindPicking();

  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const home = homeStop();
    if (!gliding) { camera.position.copy(home.pos); controls.target.copy(home.look); camera.fov = home.fov; }
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(canvas.parentElement);
  fit();
  // intro: kamera melayang masuk
  camera.position.set(HOME.pos.x + 2.5, HOME.pos.y + 2.2, HOME.pos.z + 5);
  glideTo(homeStop().pos, homeStop().look, homeStop().fov, 1.6);

  clock = new THREE.Clock();
  let lastType = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    controls.update();
    if (!reducedMotion) {
      // karakter bergoyang pelan
      busts.forEach((b) => {
        b.group.position.y = Math.sin(t * 1.3 + b.phase) * 0.02;
        b.group.rotation.y = Math.sin(t * 0.5 + b.phase) * 0.08;
      });
      // uap kopi naik
      steams.forEach((sp) => {
        const p = ((t * 0.35) + sp.userData.phase) % 1;
        sp.position.y = 1.0 + p * 0.55;
        sp.position.x = sp.userData.baseX + Math.sin(p * 6 + sp.userData.phase * 9) * 0.03;
        sp.material.opacity = 0.5 * (1 - p) * Math.min(1, p * 6);
        const s = 0.1 + p * 0.22;
        sp.scale.set(s, s, 1);
      });
      // awan + blimp melayang
      clouds.forEach((c) => {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 12) c.position.x = -12;
      });
      if (blimp) {
        blimp.position.x += 0.25 * dt;
        blimp.position.y = 5.4 + Math.sin(t * 0.4) * 0.15;
        blimp.rotation.z = Math.sin(t * 0.4) * 0.03;
        if (blimp.position.x > 13) blimp.position.x = -13;
      }
      // LED rak server berkedip
      rackLeds.forEach((l) => {
        l.mesh.material.color.setHex(Math.sin(t * 2 + l.phase) > 0 ? 0x9ff0b8 : 0x2b6e44);
      });
      // layar monitor mengetik
      if (t - lastType > 0.09) {
        lastType = t;
        monitors.forEach((mon, i) => {
          if (Math.floor(t * 10 + i * 3) % 2 !== 0) return;
          if (mon.hold > 0) { mon.hold--; return; }
          const line = mon.lines[mon.lineIdx];
          if (mon.charIdx < line.length) mon.charIdx++;
          else if (mon.lineIdx < mon.lines.length - 1) { mon.lineIdx++; mon.charIdx = 0; }
          else { mon.lineIdx = 0; mon.charIdx = 0; mon.hold = 22; }
          drawScreen(mon);
        });
      }
    }
    updateLabels();
    renderer.render(scene, camera);
  };
  loop();
}
