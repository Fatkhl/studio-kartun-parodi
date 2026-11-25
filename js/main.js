// Studio Kartun Parodi — logika situs: papan episode (localStorage), tim karyawan (localStorage, tanpa batas),
// pipeline, aturan, partner LLM, panel MCP, modal, toast, animasi UI (anime.js + Lottie).
import { animate, stagger } from 'animejs';
import { initOffice, syncBoard, focusDesk, resetView, setActiveDesk, setDeskQueues, rebuildDesks, STAGE_COLORS } from './office3d.js';
import { STAGES, STAGE_LABEL, loadEmployees, saveEmployees, createEmployee, canDelete, employeesOfStage } from './employees.js';

// ---------- data studio (dari ~/workspace/studio/*.json) ----------
// Karyawan: satu sumber di js/employees.js (localStorage `skp-employees-v1`, seed = karyawan inti).
// Kartu tim dan meja 3D sama-sama dirender dari daftar `employees` ini.
let employees = loadEmployees();
const empById = (id) => employees.find((e) => e.id === id);

const PIPELINE = [
  { time: '06:30–08:00', stage: '1. TREND SCAN', owner: 'Trend Hunter', st: 'ide', task: 'Scan TikTok + X + YouTube. Pilih 3 ide parodi, tulis ke ideas/.' },
  { time: '08:00–10:00', stage: '2. NASKAH', owner: 'Scriptwriter (Claude)', st: 'naskah', task: 'Tulis naskah buat ide #1 (prioritas). Hook + dialog + punchline + caption. Simpan ke scripts/.' },
  { time: '10:00–11:00', stage: '3. SUARA', owner: 'Voiceover', st: 'suara', task: 'Rekam narasi + dialog per karakter. Simpan ke audio/<tanggal>-<topik>/.' },
  { time: '11:00–15:00', stage: '4. EDIT', owner: 'Editor', st: 'edit', task: 'Rakit video kartun di Remotion/toon-shorts-pack. Render final .mp4 1080x1920. Review visual sebelum lanjut.' },
  { time: '15:00–16:00', stage: '5. POSTING', owner: 'Publisher', st: 'terbit', task: 'Posting ke TikTok + FB + YouTube. Catat link + waktu ke published/.' },
  { time: '20:00–21:00', stage: '6. ANALITIK', owner: 'Analis', st: 'terbit', task: 'Baca performa hari ini + video kemarin. Tulis kesimpulan ke analytics/<tanggal>.json. Feedback ke Trend Hunter buat besok.' },
];
const RULES = [
  'Satu video selesai per hari dulu — jangan kejar kuantitas sebelum kualitas stabil.',
  'Parodi boleh tajam tapi jangan fitnah: satir ke peristiwa/pernyataan publik, bukan tuduhan palsu soal orang.',
  'Setiap episode harus jelas sumber viralnya (link/jejak tren di ideas/).',
  'Kalau ada klaim/strike di satu platform, stop dan lapor ke user — jangan lanjut posting.',
  'User yang tentukan nama studio + nama akun final sebelum posting pertama.',
];
const PARTNERS = [
  { name: 'Muse', role: 'Manager + Editor + Voiceover + Publisher + Analis', status: 'active', label: 'Aktif' },
  { name: 'Claude', role: 'Scriptwriter', status: 'pending_setup', label: 'Pending setup' },
  { name: 'Gemini', role: 'Trend Hunter (video + YouTube)', status: 'pending_setup', label: 'Pending setup' },
  { name: 'Grok', role: 'Meme Scout (X trends + punchline)', status: 'not_available', label: 'Belum tersedia' },
];
const MCP_CONFIG = { mcpServers: { 'studio-kartun-parodi': { command: 'node', args: ['/home/hatch/workspace/studio/mcp-server/server.mjs'] } } };
const MCP_CMD = 'claude mcp add --transport stdio studio-kartun-parodi -- node /home/hatch/workspace/studio/mcp-server/server.mjs';
const MCP_TOOLS = [
  ['studio_status', 'Baca keadaan studio: niche, platform, karyawan, pipeline.'],
  ['studio_list_episodes', 'Daftar isi folder kerja: ideas, scripts, audio, video, published, analytics.'],
  ['studio_create_idea', 'Tulis ide episode parodi baru ke folder ideas/.'],
  ['studio_read_file', 'Baca satu file JSON dari folder kerja studio.'],
  ['studio_write_script', 'Tulis naskah episode ke folder scripts/.'],
  ['studio_log_published', 'Catat episode yang sudah diposting ke folder published/.'],
  ['studio_log_analytics', 'Catat performa harian ke folder analytics/.'],
];

// ---------- util ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const anim = (t, p) => (reduced ? null : animate(t, p));

// ---------- Lottie (vendor lokal) ----------
// Animasi kecil dibuat sebagai data JSON Lottie langsung (tanpa file eksternal).
const LOTTIE_PULSE = {
  v: '5.7.4', fr: 30, ip: 0, op: 60, w: 100, h: 100, nm: 'pulse', ddd: 0, assets: [],
  layers: [
    { ddd: 0, ind: 1, ty: 4, nm: 'ring', sr: 1, ao: 0, ip: 0, op: 60, st: 0, bm: 0,
      ks: { o: { a: 1, k: [{ t: 0, s: [90], i: { x: [0.3], y: [1] }, o: { x: [0.7], y: [0] } }, { t: 60, s: [0] }] },
        r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [35, 35, 100], i: { x: [0.3, 0.3, 0.3], y: [1, 1, 1] }, o: { x: [0.7, 0.7, 0.7], y: [0, 0, 0] } }, { t: 60, s: [100, 100, 100] }] } },
      shapes: [{ ty: 'gr', nm: 'g', it: [
        { ty: 'el', nm: 'e', d: 1, s: { a: 0, k: [84, 84] }, p: { a: 0, k: [0, 0] } },
        { ty: 'st', nm: 's', c: { a: 0, k: [0.31, 0.82, 0.63, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 8 }, lc: 2, lj: 2 },
        { ty: 'tr', nm: 't', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
      ] }] },
    { ddd: 0, ind: 2, ty: 4, nm: 'core', sr: 1, ao: 0, ip: 0, op: 60, st: 0, bm: 0,
      ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
      shapes: [{ ty: 'gr', nm: 'g', it: [
        { ty: 'el', nm: 'e', d: 1, s: { a: 0, k: [36, 36] }, p: { a: 0, k: [0, 0] } },
        { ty: 'fl', nm: 'f', c: { a: 0, k: [0.31, 0.82, 0.63, 1] }, o: { a: 0, k: 100 }, r: 1 },
        { ty: 'tr', nm: 't', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
      ] }] },
  ],
};
const LOTTIE_CHECK = {
  v: '5.7.4', fr: 30, ip: 0, op: 24, w: 100, h: 100, nm: 'check', ddd: 0, assets: [],
  layers: [
    { ddd: 0, ind: 1, ty: 4, nm: 'tick', sr: 1, ao: 0, ip: 0, op: 24, st: 0, bm: 0,
      ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
      shapes: [{ ty: 'gr', nm: 'g', it: [
        { ty: 'sh', nm: 'p', ks: { a: 0, k: { i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], v: [[-22, 2], [-6, 18], [24, -16]], c: false } } },
        { ty: 'tm', nm: 'trim', s: { a: 0, k: 0 }, e: { a: 1, k: [{ t: 2, s: [0], i: { x: [0.2], y: [1] }, o: { x: [0.6], y: [0] } }, { t: 18, s: [100] }] }, o: { a: 0, k: 0 }, m: 1 },
        { ty: 'st', nm: 's', c: { a: 0, k: [0.07, 0.09, 0.13, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 11 }, lc: 2, lj: 2 },
        { ty: 'tr', nm: 't', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
      ] }] },
  ],
};
let checkAnim = null;
function initLottie() {
  const L = window.lottie;
  if (!L) return;
  try {
    L.loadAnimation({ container: $('#live-dot'), renderer: 'svg', loop: true, autoplay: !reduced, animationData: LOTTIE_PULSE });
    checkAnim = L.loadAnimation({ container: $('#toast-ic'), renderer: 'svg', loop: false, autoplay: false, animationData: LOTTIE_CHECK });
  } catch (err) { console.warn('Lottie tidak dimuat:', err); }
}

// ---------- toast ----------
let toastTimer = null;
function toast(msg, action = null) {
  const t = $('#toast');
  const m = $('#toast-msg');
  m.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.addEventListener('click', () => { action.fn(); t.hidden = true; });
    m.append(' ', b);
  }
  t.hidden = false;
  checkAnim?.goToAndPlay(0, true);
  anim(t, { y: [16, 0], opacity: [0, 1], duration: 320, ease: 'outQuad' });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 4200 : 2400);
}
async function copyText(text, label, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* abaikan */ }
    ta.remove();
  }
  if (btn) {
    const s = $('span', btn); const old = s.textContent;
    s.textContent = 'Tersalin ✓'; btn.classList.add('ok');
    setTimeout(() => { s.textContent = old; btn.classList.remove('ok'); }, 1600);
  }
  toast(`${label} disalin ke clipboard`);
}

// ---------- episode store (localStorage) ----------
const LS_KEY = 'skp-episodes-v1';
const SEED = [
  { id: 'seed-1', topic: 'Dasco & Golden Oasis', source: 'X trending', angle: 'Sidang berubah jadi kuis dadakan', why: 'Ramai dibahas, 12rb repost dalam sehari', stage: 'ide', date: '2026-11-25' },
  { id: 'seed-2', topic: 'Macet Jakarta vs Kereta Cepat', source: 'TikTok FYP', angle: 'Macetnya ngobrol sama kereta', why: 'Sound viral, 2,1 jt views', stage: 'naskah', date: '2026-11-25' },
];
function loadEpisodes() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { localStorage.setItem(LS_KEY, JSON.stringify(SEED)); return SEED.map((e) => ({ ...e })); }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((e) => e && STAGES.includes(e.stage)) : SEED.map((e) => ({ ...e }));
  } catch { return SEED.map((e) => ({ ...e })); }
}
function saveEpisodes() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(episodes)); } catch { toast('Gagal menyimpan — penyimpanan browser penuh/terkunci'); }
}
let episodes = loadEpisodes();
const uid = () => 'ep-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

// ---------- papan episode ----------
const ICON = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
function renderBoard(animateId = null) {
  STAGES.forEach((st) => {
    const body = $(`[data-col="${st}"]`);
    const list = episodes.filter((e) => e.stage === st);
    $(`[data-count="${st}"]`).textContent = list.length;
    body.innerHTML = '';
    if (!list.length) {
      body.innerHTML = `<div class="col-empty">Kosong — seret kartu ke sini</div>`;
      return;
    }
    list.forEach((ep) => {
      const idx = STAGES.indexOf(ep.stage);
      const d = document.createElement('article');
      d.className = 'note';
      d.dataset.stage = ep.stage;
      d.dataset.id = ep.id;
      d.draggable = true;
      d.tabIndex = 0;
      d.setAttribute('aria-label', `${ep.topic} — tahap ${STAGE_LABEL[ep.stage]}. Tekan Enter untuk detail.`);
      d.innerHTML = `
        <h4>${esc(ep.topic)}</h4>
        <p class="note-meta"><span>${esc(ep.source)}</span><span>${esc(ep.date)}</span></p>
        ${ep.angle && ep.angle !== '-' ? `<p class="note-angle">${esc(ep.angle)}</p>` : ''}
        <div class="note-actions">
          <button type="button" class="ic" data-move="-1" ${idx === 0 ? 'disabled' : ''} title="${idx > 0 ? 'Ke ' + STAGE_LABEL[STAGES[idx - 1]] : ''}" aria-label="Pindah ke tahap sebelumnya">${ICON.prev}</button>
          ${idx < STAGES.length - 1 ? `<button type="button" class="adv" data-move="1" title="Pindah ke ${STAGE_LABEL[STAGES[idx + 1]]}">${STAGE_LABEL[STAGES[idx + 1]]} ${ICON.next}</button>` : '<span class="done-tag">Selesai ✓</span>'}
          <button type="button" class="ic del" data-del title="Hapus episode" aria-label="Hapus episode">${ICON.del}</button>
        </div>`;
      d.addEventListener('click', (e) => { if (!e.target.closest('button')) openEpisode(ep.id); });
      d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === d) openEpisode(ep.id); });
      d.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', ep.id);
        e.dataTransfer.effectAllowed = 'move';
        d.classList.add('dragging');
      });
      d.addEventListener('dragend', () => d.classList.remove('dragging'));
      body.appendChild(d);
      if (animateId === ep.id) anim(d, { scale: [0.7, 1], opacity: [0, 1], rotate: [-3, 0], duration: 520, ease: 'outBack' });
    });
  });
  renderStats();
  syncBoard(episodes);
  refreshQueues();
}
// antrean per karyawan = jumlah episode di tahapnya (beberapa karyawan setahap berbagi antrean yang sama)
function refreshQueues() {
  const counts = Object.fromEntries(employees.map((e) => [e.id, episodes.filter((x) => x.stage === e.stage).length]));
  setDeskQueues(counts);
  renderTeamQueues();
}
function renderStats() {
  const total = episodes.length;
  const done = episodes.filter((e) => e.stage === 'terbit').length;
  $('#st-total').textContent = total;
  $('#st-wip').textContent = total - done;
  $('#st-done').textContent = done;
  $('#nav-count').textContent = `${total} episode`;
  $('#flow').innerHTML = STAGES.map((st) => {
    const n = episodes.filter((e) => e.stage === st).length;
    return `<span style="--c:${STAGE_COLORS[st]};flex-grow:${Math.max(n, 0.35)}" class="${n ? '' : 'zero'}" title="${STAGE_LABEL[st]}: ${n}"><b>${n}</b><small>${STAGE_LABEL[st]}</small></span>`;
  }).join('');
}
function moveEpisode(id, dir) {
  const ep = episodes.find((e) => e.id === id); if (!ep) return;
  const idx = STAGES.indexOf(ep.stage) + dir;
  if (idx < 0 || idx >= STAGES.length) return;
  moveEpisodeTo(id, STAGES[idx]);
}
function moveEpisodeTo(id, stage) {
  const ep = episodes.find((e) => e.id === id);
  if (!ep || !STAGES.includes(stage) || ep.stage === stage) return;
  ep.stage = stage;
  saveEpisodes(); renderBoard(id);
  toast(`“${ep.topic}” pindah ke ${STAGE_LABEL[stage]}`);
}
function deleteEpisode(id) {
  const i = episodes.findIndex((e) => e.id === id); if (i < 0) return;
  const [removed] = episodes.splice(i, 1);
  saveEpisodes(); renderBoard();
  toast('Episode dihapus.', { label: 'Urungkan', fn: () => { episodes.splice(Math.min(i, episodes.length), 0, removed); saveEpisodes(); renderBoard(removed.id); } });
}
function addEpisode(topic, source, angle, why) {
  const ep = { id: uid(), topic, source, angle: angle || '-', why: why || '-', stage: 'ide', date: today() };
  episodes.unshift(ep);
  saveEpisodes(); renderBoard(ep.id);
  toast('Ide baru ditempel di kolom Ide');
}

$$('.col').forEach((col) => {
  const body = $('.col-body', col);
  col.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drag-over'); });
  col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
  col.addEventListener('drop', (e) => {
    e.preventDefault();
    col.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    if (id) moveEpisodeTo(id, body.dataset.col);
  });
});
$('#board').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-move], button[data-del]');
  if (!btn) return;
  const note = btn.closest('.note'); if (!note) return;
  if (btn.hasAttribute('data-del')) deleteEpisode(note.dataset.id);
  else moveEpisode(note.dataset.id, Number(btn.dataset.move));
});
$('#idea-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const topic = $('#f-topic').value.trim();
  const source = $('#f-source').value.trim();
  if (!topic || !source) {
    (topic ? $('#f-source') : $('#f-topic')).focus();
    anim('#idea-form', { x: [0, -8, 8, -4, 0], duration: 360, ease: 'inOutQuad' });
    return;
  }
  addEpisode(topic, source, $('#f-angle').value.trim(), $('#f-why').value.trim());
  e.target.reset();
  $('#f-topic').focus();
});

// ---------- karyawan (jumlah tidak dibatasi) ----------
function renderTeam() {
  $('#team-count').textContent = `${employees.length} orang`;
  $('#team').innerHTML = employees.map((emp) => {
    const del = canDelete(emp);
    return `<div class="emp-wrap${del ? ' custom' : ''}" data-wrap="${esc(emp.id)}">
      <button type="button" class="emp" data-emp="${esc(emp.id)}" style="--c:${esc(emp.color)}">
        <span class="emp-top">
          <span class="emp-av" aria-hidden="true">${esc(emp.avatar)}</span>
          <span class="emp-stage">Tahap ${STAGE_LABEL[emp.stage]}</span>
        </span>
        <span class="emp-name">${esc(emp.name)}</span>
        ${emp.role ? `<span class="emp-role">${esc(emp.role)}</span>` : ''}
        <span class="emp-llm">${esc(emp.llm)}</span>
        <span class="emp-job">${esc(emp.job)}</span>
        <span class="emp-foot"><span class="emp-queue"></span><span class="emp-more">Detail →</span></span>
      </button>
      ${del ? `<button type="button" class="emp-del" data-del-emp="${esc(emp.id)}" title="Hapus ${esc(emp.name)}" aria-label="Hapus karyawan ${esc(emp.name)}">${ICON.del}</button>` : ''}
    </div>`;
  }).join('');
}
function renderTeamQueues() {
  $$('.emp').forEach((card) => {
    const emp = empById(card.dataset.emp); if (!emp) return;
    const n = episodes.filter((e) => e.stage === emp.stage).length;
    $('.emp-queue', card).innerHTML = n ? `<i class="on"></i>${n} episode antre` : '<i></i>Standby';
    card.classList.toggle('busy', n > 0);
  });
}
$('#team').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-emp]');
  if (del) { removeEmployee(del.dataset.delEmp); return; }
  const card = e.target.closest('.emp');
  if (!card) return;
  setActiveDesk(card.dataset.emp);
  focusDesk(card.dataset.emp);
  openEmployee(card.dataset.emp);
});
// setelah daftar berubah: kartu tim + meja 3D dibangun ulang dari daftar yang sama
function applyTeamChange(newId = null) {
  renderTeam();
  rebuildDesks(employees);
  refreshQueues();
  if (newId) {
    const w = $(`[data-wrap="${CSS.escape(newId)}"]`);
    if (w) anim(w, { scale: [0.85, 1], opacity: [0, 1], duration: 560, ease: 'outBack' });
  }
}
function persistEmployees() {
  if (!saveEmployees(employees)) toast('Gagal menyimpan tim — penyimpanan browser penuh/terkunci');
}
function showDesk(id) {
  setActiveDesk(id); focusDesk(id);
  document.getElementById('kantor').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}
function addEmployee(vals) {
  const emp = createEmployee(vals, employees);
  employees.push(emp);
  persistEmployees();
  applyTeamChange(emp.id);
  toast(`${emp.name} bergabung — mejanya sudah ada di kantor 3D`, { label: 'Lihat meja', fn: () => showDesk(emp.id) });
  return emp;
}
function removeEmployee(id) {
  const emp = empById(id);
  if (!canDelete(emp)) return false; // karyawan inti tidak bisa dihapus (pemilik tahap pipeline)
  if (!confirm(`Hapus karyawan “${emp.name}”${emp.role ? ` (${emp.role})` : ''}? Kartunya dan mejanya di kantor 3D ikut hilang.`)) return false;
  employees = employees.filter((x) => x.id !== id);
  persistEmployees();
  closeModal();
  applyTeamChange();
  toast(`${emp.name} dihapus dari tim`);
  return true;
}
$('#emp-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const missing = ['e-name', 'e-role', 'e-llm', 'e-job'].find((id) => !$('#' + id).value.trim());
  const stage = $('#e-stage').value;
  if (missing || !STAGES.includes(stage)) {
    $('#' + (missing || 'e-stage')).focus();
    anim('#emp-form', { x: [0, -8, 8, -4, 0], duration: 360, ease: 'inOutQuad' });
    return;
  }
  addEmployee({ name: $('#e-name').value.trim(), role: $('#e-role').value.trim(), llm: $('#e-llm').value.trim(), stage, job: $('#e-job').value.trim() });
  e.target.reset();
  $('#e-name').focus({ preventScroll: true });
});

// ---------- pipeline / aturan / partner ----------
function jakartaHours() {
  const s = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false });
  const [h, m] = s.split(':').map(Number);
  return { h, m, dec: h + m / 60, text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}
const toDec = (s) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
function currentSlot() {
  const { dec } = jakartaHours();
  return PIPELINE.findIndex((p) => { const [a, b] = p.time.split('–').map(toDec); return dec >= a && dec < b; });
}
function renderPipeline() {
  const cur = currentSlot();
  $('#pipeline').innerHTML = PIPELINE.map((p, i) => `<li class="${i === cur ? 'now' : ''}" style="--c:${STAGE_COLORS[p.st]}">
      <span class="p-dot" aria-hidden="true"></span>
      <div class="p-main">
        <div class="p-row"><span class="p-time">${esc(p.time)}</span><span class="p-owner">${esc(p.owner)}</span>${i === cur ? '<span class="p-now">Sedang berjalan</span>' : ''}</div>
        <h4>${esc(p.stage)}</h4>
        <p>${esc(p.task)}</p>
      </div>
    </li>`).join('');
  $('#rules').innerHTML = RULES.map((r) => `<li>${esc(r)}</li>`).join('');
  $('#partners').innerHTML = PARTNERS.map((p) => `<li>
      <span class="pa-av" aria-hidden="true">${esc(p.name[0])}</span>
      <span class="pa-txt"><b>${esc(p.name)}</b><small>${esc(p.role)}</small></span>
      <span class="status ${p.status}">${esc(p.label)}</span>
    </li>`).join('');
}
function tickClock() {
  const { text } = jakartaHours();
  $('#clock').textContent = text;
  const cur = currentSlot();
  $('#now-stage').textContent = cur >= 0
    ? `${PIPELINE[cur].stage.replace(/^\d\.\s*/, '')} — ${PIPELINE[cur].owner}`
    : 'Di luar jam produksi • Trend Scan mulai 06:30';
  const lis = $$('#pipeline li');
  lis.forEach((li, i) => li.classList.toggle('now', i === cur));
}

// ---------- MCP ----------
function renderMCP() {
  $('#mcp-json').textContent = JSON.stringify(MCP_CONFIG, null, 2);
  $('#mcp-cmd').textContent = MCP_CMD;
  $('#mcp-tools').innerHTML = MCP_TOOLS.map(([n, d], i) => `<li><span class="t-n">${String(i + 1).padStart(2, '0')}</span><span><code>${esc(n)}</code><small>${esc(d)}</small></span></li>`).join('');
  $$('.btn-copy').forEach((b) => b.addEventListener('click', () => copyText($('#' + b.dataset.copy).textContent, b.dataset.label, b)));
}

// ---------- modal ----------
let lastFocus = null;
function openModal(html, color = '#ffc857') {
  lastFocus = document.activeElement;
  $('#modal-body').innerHTML = html;
  const card = $('.modal-card');
  card.style.setProperty('--c', color);
  $('#modal').hidden = false;
  document.body.classList.add('modal-open');
  card.scrollTop = 0;
  card.focus({ preventScroll: true });
  anim('.modal-backdrop', { opacity: [0, 1], duration: 260, ease: 'outQuad' });
  anim(card, { y: [36, 0], opacity: [0, 1], scale: [0.98, 1], duration: 420, ease: 'outExpo' });
  anim('#modal-body .m-sec', { y: [14, 0], opacity: [0, 1], duration: 420, delay: stagger(45, { start: 90 }), ease: 'outQuad' });
}
function closeModal() {
  if ($('#modal').hidden) return;
  $('#modal').hidden = true;
  document.body.classList.remove('modal-open');
  setActiveDesk(null);
  lastFocus?.focus?.({ preventScroll: true });
}
$$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
$('#modal-body').addEventListener('click', (e) => {
  const ep = e.target.closest('[data-open-ep]');
  if (ep) { openEpisode(ep.dataset.openEp); return; }
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const [act, arg, arg2] = btn.dataset.act.split(':');
  if (act === 'move') { moveEpisode(arg, Number(arg2)); openEpisode(arg); }
  else if (act === 'del') { closeModal(); deleteEpisode(arg); }
  else if (act === 'focus') { closeModal(); showDesk(arg); }
  else if (act === 'emp') openEmployee(arg);
  else if (act === 'delemp') removeEmployee(arg);
  else if (act === 'close') closeModal();
});
const list = (arr) => `<ul class="m-list">${arr.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
function openEmployee(id) {
  const emp = empById(id); if (!emp) return;
  const queue = episodes.filter((e) => e.stage === emp.stage);
  const mates = employeesOfStage(employees, emp.stage).filter((x) => x.id !== emp.id);
  const del = canDelete(emp);
  // karyawan baru dari form belum punya input/output/tools/gaya kerja → bagian kosong tidak ditampilkan
  const io = [emp.inputs.length ? `<section class="m-sec"><h3>Input</h3>${list(emp.inputs)}</section>` : '', emp.outputs.length ? `<section class="m-sec"><h3>Output</h3>${list(emp.outputs)}</section>` : ''].join('');
  openModal(`
    <header class="m-head">
      <span class="m-av" aria-hidden="true">${esc(emp.avatar)}</span>
      <div>
        <span class="m-eyebrow">Karyawan${emp.role ? ' • ' + esc(emp.role) : ''} • Tahap ${STAGE_LABEL[emp.stage]}</span>
        <h2 id="modal-title">${esc(emp.name)}</h2>
        <div class="m-chips"><span class="m-chip strong">LLM: ${esc(emp.llm)}</span><span class="m-chip">${queue.length ? queue.length + ' episode antre' : 'Standby'}</span>${del ? '<span class="m-chip">Karyawan tambahan</span>' : ''}</div>
      </div>
    </header>
    <section class="m-sec"><h3>Tugas</h3><p>${esc(emp.job)}</p></section>
    <section class="m-sec"><h3>Antrean tahap ${STAGE_LABEL[emp.stage]}</h3>
      ${queue.length ? `<ul class="m-queue">${queue.map((e) => `<li><button type="button" data-open-ep="${esc(e.id)}"><b>${esc(e.topic)}</b><small>${esc(e.source)} • ${esc(e.date)}</small></button></li>`).join('')}</ul>` : '<p class="muted">Belum ada episode di tahap ini — standby.</p>'}
    </section>
    ${mates.length ? `<section class="m-sec"><h3>Rekan setahap</h3><div class="m-chips">${mates.map((m) => `<button type="button" class="m-chip link" data-act="emp:${esc(m.id)}">${esc(m.avatar)} ${esc(m.name)}</button>`).join('')}</div></section>` : ''}
    ${io ? `<div class="m-grid">${io}</div>` : ''}
    ${emp.tools.length ? `<section class="m-sec"><h3>Tools</h3><div class="m-tags">${emp.tools.map((t) => `<span>${esc(t)}</span>`).join('')}</div></section>` : ''}
    ${emp.voice ? `<section class="m-sec"><h3>Gaya kerja</h3><blockquote>“${esc(emp.voice)}”</blockquote></section>` : ''}
    <footer class="m-actions">
      ${del ? `<button type="button" class="btn btn-danger" data-act="delemp:${esc(emp.id)}">Hapus karyawan</button><span class="sp"></span>` : ''}
      <button type="button" class="btn btn-ghost" data-act="close">Tutup</button>
      <button type="button" class="btn btn-primary" data-act="focus:${esc(emp.id)}">Lihat mejanya di kantor 3D</button>
    </footer>`, emp.color);
}
function openEpisode(id) {
  const ep = episodes.find((e) => e.id === id); if (!ep) return;
  const idx = STAGES.indexOf(ep.stage);
  const owners = employeesOfStage(employees, ep.stage);
  openModal(`
    <header class="m-head">
      <span class="m-av note-av" aria-hidden="true">📌</span>
      <div>
        <span class="m-eyebrow">Episode • ${esc(ep.date)}</span>
        <h2 id="modal-title">${esc(ep.topic)}</h2>
        <div class="m-chips"><span class="m-chip strong">Tahap ${STAGE_LABEL[ep.stage]}</span>${owners.map((o) => `<button type="button" class="m-chip link" data-act="emp:${esc(o.id)}">PJ: ${esc(o.name)}</button>`).join('')}</div>
      </div>
    </header>
    <ol class="stepper m-sec" aria-label="Progres tahap">
      ${STAGES.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'cur' : ''}" style="--c:${STAGE_COLORS[s]}"><span></span>${STAGE_LABEL[s]}</li>`).join('')}
    </ol>
    <section class="m-sec"><h3>Sumber tren</h3><p>${esc(ep.source)}</p></section>
    <section class="m-sec"><h3>Angle parodi</h3><p>${esc(ep.angle)}</p></section>
    <section class="m-sec"><h3>Kenapa layak dibuat</h3><p>${esc(ep.why)}</p></section>
    <footer class="m-actions">
      <button type="button" class="btn btn-danger" data-act="del:${ep.id}">Hapus</button>
      <span class="sp"></span>
      ${idx > 0 ? `<button type="button" class="btn btn-ghost" data-act="move:${ep.id}:-1">‹ ${STAGE_LABEL[STAGES[idx - 1]]}</button>` : ''}
      ${idx < STAGES.length - 1 ? `<button type="button" class="btn btn-primary" data-act="move:${ep.id}:1">Pindah ke ${STAGE_LABEL[STAGES[idx + 1]]} ›</button>` : '<button type="button" class="btn btn-ghost" data-act="close">Tutup</button>'}
    </footer>`, STAGE_COLORS[ep.stage]);
}

// ---------- animasi masuk (anime.js) ----------
function introAnimations() {
  if (reduced) return;
  animate('.nav', { y: [-20, 0], opacity: [0, 1], duration: 600, ease: 'outQuad' });
  animate('.hero-card > *', { y: [24, 0], opacity: [0, 1], duration: 700, delay: stagger(70, { start: 250 }), ease: 'outExpo' });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const kids = $$(':scope > .sec-head, :scope > .card, :scope > .board, :scope > .team, :scope > .ops, :scope > .mcp', en.target);
      animate(kids, { y: [30, 0], opacity: [0, 1], duration: 700, delay: stagger(90), ease: 'outExpo' });
      if (en.target.id === 'tim') animate('.emp', { y: [24, 0], opacity: [0, 1], duration: 600, delay: stagger(70, { start: 150 }), ease: 'outExpo' });
      if (en.target.id === 'operasional') animate('#pipeline li', { x: [-16, 0], opacity: [0, 1], duration: 500, delay: stagger(60, { start: 150 }), ease: 'outQuad' });
    });
  }, { threshold: 0.12 });
  $$('.section').forEach((s) => io.observe(s));
}

// ---------- boot ----------
renderTeam();
renderPipeline();
renderMCP();
tickClock();
setInterval(tickClock, 20000);
$('#btn-reset').addEventListener('click', resetView);
try {
  initOffice($('#office'), $('#labels'), { employees, onSelect: (id) => openEmployee(id), onSelectEpisode: (id) => openEpisode(id) });
  $('#stage-loading').remove();
} catch (err) {
  console.error('Kantor 3D gagal dimuat:', err);
  $('#stage-loading').textContent = 'Kantor 3D butuh WebGL dan tidak bisa dimuat di browser ini. Papan episode di bawah tetap berfungsi.';
  $('#stage').classList.add('no3d');
}
renderBoard();
initLottie();
introAnimations();
