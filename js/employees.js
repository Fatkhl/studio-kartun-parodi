// Studio Kartun Parodi — data karyawan (satu sumber untuk kartu tim + meja 3D).
// Disimpan di localStorage `skp-employees-v1`, di-seed dengan karyawan inti studio.
// Jumlah karyawan tidak dibatasi: tambah sebanyak yang kamu mau, satu tahap boleh dipegang beberapa orang.

export const STAGES = ['ide', 'naskah', 'suara', 'edit', 'terbit'];
export const STAGE_LABEL = { ide: 'Ide', naskah: 'Naskah', suara: 'Suara', edit: 'Edit', terbit: 'Terbit' };
export const STAGE_COLORS = { ide: '#ffc857', naskah: '#6cb8ff', suara: '#ff7aa2', edit: '#a78bfa', terbit: '#4fd1a1' };
export const EMP_KEY = 'skp-employees-v1';

// ---------- seed: karyawan inti (data kerja dari ~/workspace/studio/*.json + tampilan 3D) ----------
export const SEED_EMPLOYEES = [
  { id: 'trend-hunter', name: 'Trend Hunter', llm: 'Gemini + Grok + Muse', stage: 'ide',
    job: 'Cari tren viral tiap hari di TikTok + X + YouTube, analisis kenapa viral, pilih 3 ide parodi terbaik buat hari itu.',
    inputs: ['TikTok Creative Center, FYP', 'X trending (via Grok)', 'YouTube trending + Shorts (via Gemini)'],
    outputs: ['ideas/<tanggal>-<topik>.json — 3 ide dengan sumber tren, angle parodi, dan kenapa layak dibuat'],
    tools: ['Gemini video understanding', 'Grok X trends', 'Browser (TikTok Creative Center)'],
    voice: 'Riset dulu, opini belakangan. Setiap ide harus punya bukti viral (views, share, atau komentar).',
    color: STAGE_COLORS.ide, avatar: '🔎', skin: '#e9b48f', hair: '#1f140e', hairStyle: 'short', hat: 'cap', prop: 'phone', screen: 'trends', mug: '#f4efe6' },
  { id: 'scriptwriter', name: 'Scriptwriter', llm: 'Claude', stage: 'naskah',
    job: 'Tulis naskah parodi: hook 3 detik pertama, dialog karakter, punchline, dan caption. Bahasa Indonesia, gaya kartun, satir tajam tapi lucu. Satu naskah per episode, 30–90 detik.',
    inputs: ['ideas/<tanggal>-<topik>.json dari Trend Hunter'],
    outputs: ['scripts/<tanggal>-<topik>.json — hook, naskah dialog per karakter, arahan visual, caption + judul'],
    tools: ['Claude Code / Claude API'],
    voice: 'Dialog hidup, karakter beda-beda suaranya, punchline di akhir. Jangan ceramah, jangan kaku.',
    color: STAGE_COLORS.naskah, avatar: '✍️', skin: '#f3d0b0', hair: '#7a4526', hairStyle: 'messy', hat: 'glasses', prop: 'papers', screen: 'code', mug: '#2f3a56' },
  { id: 'voiceover', name: 'Voiceover', llm: 'Muse + TTS', stage: 'suara',
    job: 'Rekam narasi + dialog karakter pakai suara AI. Tiap karakter beda suara/intonasi. Bahasa Indonesia natural, bukan robotik.',
    inputs: ['scripts/<tanggal>-<topik>.json dari Scriptwriter'],
    outputs: ['audio/<tanggal>-<topik>/ — file audio per karakter + narasi'],
    tools: ['Library voice (sudah ada)', 'TTS / spoken-audio'],
    voice: 'Natural, ekspresif, intonasi sesuai karakter. Kalau satu suara dipakai buat semua karakter, gagal.',
    color: STAGE_COLORS.suara, avatar: '🎙️', skin: '#c98d67', hair: '#24160f', hairStyle: 'bun', hat: 'headphones', prop: 'mic', screen: 'wave', mug: '#ffd6e2' },
  { id: 'editor', name: 'Editor', llm: 'Muse', stage: 'edit',
    job: 'Rakit video kartun vertikal 9:16 dari naskah + audio: karakter, gerakan, subtitle, efek, musik, pacing. Render final 1080x1920.',
    inputs: ['scripts/<tanggal>-<topik>.json', 'audio/<tanggal>-<topik>/'],
    outputs: ['video/<tanggal>-<topik>/ — project Remotion + render final .mp4'],
    tools: ['toon-shorts-pack (Remotion + Three.js)', 'Blender (3D bila perlu)', 'creative-libs (anime.js, pixijs, motion-canvas, lottie, tone.js)', 'ffmpeg'],
    voice: 'Pacing cepat, subtitle selalu ada, visual hidup. Video yang bikin orang nonton sampai habis.',
    color: STAGE_COLORS.edit, avatar: '🎬', skin: '#8d5a3c', hair: '#0f0b0a', hairStyle: 'short', hat: 'beanie', prop: 'clapper', screen: 'timeline', mug: '#1d1d24' },
  { id: 'publisher-analyst', name: 'Publisher + Analis', llm: 'Muse + Gemini', stage: 'terbit',
    job: 'Posting ke TikTok + FB + YouTube dengan judul/caption/hashtag yang pas per platform, catat link + waktu posting. Malamnya baca analitik: mana yang viral, kenapa, jam berapa paling rame — terus kasih feedback ke Trend Hunter buat besok.',
    inputs: ['video/<tanggal>-<topik>/ final .mp4', 'scripts/<tanggal>-<topik>.json (judul + caption)'],
    outputs: ['published/<tanggal>-<topik>.json — link posting per platform + waktu', 'analytics/<tanggal>.json — views, likes, share, komentar, dan kesimpulan apa yang jalan'],
    tools: ['social-auto-upload (17 platform)', 'YouTube Studio / TikTok analytics (baca manual via browser)'],
    voice: 'Posting tepat waktu, data jujur. Kalau video flop, bilang flop dan kenapa — jangan dibagus-bagusin.',
    color: STAGE_COLORS.terbit, avatar: '🚀', skin: '#f0c19a', hair: '#3b2a1e', hairStyle: 'side', hat: 'fedora', prop: 'rocket', screen: 'chart', mug: '#e8f5ee' },
];
const CORE_IDS = new Set(SEED_EMPLOYEES.map((e) => e.id));
const SEED_BY_ID = Object.fromEntries(SEED_EMPLOYEES.map((e) => [e.id, e]));

// ---------- palet berputar untuk karyawan baru (diambil dari nilai yang sudah dipakai karyawan inti) ----------
const col = (k) => SEED_EMPLOYEES.map((e) => e[k]);
export const PALETTE = {
  color: Object.values(STAGE_COLORS),
  // 5 avatar inti + avatar tambahan bergaya sama, supaya karyawan baru tidak kembar ikon dengan karyawan inti
  avatar: ['💡', '🎨', '📣', '🧠', '🎧', '📊', '🧩', '📝', '🎥', '🛰️', ...col('avatar')],
  skin: col('skin'),
  hair: col('hair'),
  hairStyle: ['short', 'messy', 'bun', 'side'],
  hat: col('hat'),
  prop: col('prop'),
  screen: col('screen'),
  mug: col('mug'),
};
// stride berbeda per atribut (semua koprima dengan panjang paletnya) → kombinasi tampilan bervariasi
const ROT = { color: [2, 1], avatar: [1, 0], skin: [3, 1], hair: [2, 3], hairStyle: [1, 1], hat: [2, 1], prop: [3, 2], screen: [1, 3], mug: [2, 3] };
export function visualFor(seq) {
  const n = Math.max(0, seq - 1);
  const out = {};
  for (const [k, [stride, offset]] of Object.entries(ROT)) {
    const list = PALETTE[k];
    out[k] = list[(n * stride + offset) % list.length];
  }
  return out;
}

// ---------- helper ----------
const clone = (e) => JSON.parse(JSON.stringify(e));
const str = (v, max = 400) => String(v ?? '').trim().slice(0, max);
const strList = (v) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);
export const isCore = (id) => CORE_IDS.has(id);
export const canDelete = (emp) => !!emp && emp.custom === true && !CORE_IDS.has(emp.id);
export const employeesOfStage = (list, stage) => list.filter((e) => e.stage === stage);

function normalize(raw) {
  const core = SEED_BY_ID[raw.id];
  const custom = !core;
  const fallback = core || visualFor(Number(raw.seq) || 1);
  const e = {
    id: str(raw.id, 80),
    name: str(raw.name, 60),
    role: str(raw.role, 60),
    llm: str(raw.llm, 80) || (core ? core.llm : '-'),
    stage: raw.stage,
    job: str(raw.job, 600),
    inputs: strList(raw.inputs),
    outputs: strList(raw.outputs),
    tools: strList(raw.tools),
    voice: str(raw.voice, 600),
  };
  for (const k of ['avatar', 'skin', 'hair', 'hairStyle', 'hat', 'prop', 'screen', 'mug']) e[k] = str(raw[k], 24) || fallback[k];
  for (const k of ['skin', 'hair', 'mug']) if (!isHex(e[k])) e[k] = fallback[k];
  e.color = isHex(raw.color) ? raw.color : (core ? core.color : STAGE_COLORS[e.stage]);
  if (custom) { e.custom = true; e.seq = Number(raw.seq) || 1; }
  return e;
}
const valid = (e) => e && typeof e === 'object' && typeof e.id === 'string' && e.id && String(e.name ?? '').trim() && STAGES.includes(e.stage);

// ---------- load / save ----------
export function loadEmployees() {
  let arr = null;
  try {
    const raw = localStorage.getItem(EMP_KEY);
    if (raw) arr = JSON.parse(raw);
  } catch { arr = null; }
  let dirty = !Array.isArray(arr);
  if (dirty) arr = SEED_EMPLOYEES.map(clone);
  const seen = new Set();
  const list = [];
  arr.filter(valid).forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); list.push(normalize(r)); } });
  // karyawan inti selalu ada supaya setiap tahap pipeline tetap punya pemilik
  SEED_EMPLOYEES.forEach((s, i) => {
    if (!seen.has(s.id)) { list.splice(Math.min(i, list.length), 0, clone(s)); seen.add(s.id); dirty = true; }
  });
  if (dirty) saveEmployees(list);
  return list;
}
export function saveEmployees(list) {
  try { localStorage.setItem(EMP_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

// ---------- karyawan baru dari form ----------
export function createEmployee({ name, role, llm, stage, job }, list = []) {
  const seq = list.reduce((m, e) => (e.custom ? Math.max(m, Number(e.seq) || 0) : m), 0) + 1;
  const id = 'emp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return normalize({
    id, name, role, llm, stage: STAGES.includes(stage) ? stage : 'ide', job,
    inputs: [], outputs: [], tools: [], voice: '',
    ...visualFor(seq), seq, custom: true,
  });
}
