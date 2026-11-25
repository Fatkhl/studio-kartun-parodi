// Studio Kartun Parodi — logika situs: papan episode (localStorage),
// karyawan, pipeline, panel MCP, modal, animasi UI (anime.js).
import { animate, stagger } from 'animejs';
import { initOffice, syncBoard, focusDesk, resetView, setActiveDesk, DESKS } from './office3d.js';

// ---------- data studio (dari ~/workspace/studio/*.json) ----------
const STAGES = ['ide', 'naskah', 'suara', 'edit', 'terbit'];
const STAGE_LABEL = { ide: 'Ide', naskah: 'Naskah', suara: 'Suara', edit: 'Edit', terbit: 'Terbit' };

const EMPLOYEES = [
  { id: 'trend-hunter', name: 'Trend Hunter', llm: 'Gemini + Grok + Muse', stage: 'ide',
    job: 'Cari tren viral tiap hari di TikTok + X + YouTube, analisis kenapa viral, pilih 3 ide parodi terbaik buat hari itu.',
    inputs: ['TikTok Creative Center, FYP', 'X trending (via Grok)', 'YouTube trending + Shorts (via Gemini)'],
    outputs: ['ideas/<tanggal>-<topik>.json — 3 ide dengan sumber tren, angle parodi, dan kenapa layak dibuat'],
    tools: ['Gemini video understanding', 'Grok X trends', 'Browser (TikTok Creative Center)'],
    voice: 'Riset dulu, opini belakangan. Setiap ide harus punya bukti viral (views, share, atau komentar).' },
  { id: 'scriptwriter', name: 'Scriptwriter', llm: 'Claude', stage: 'naskah',
    job: 'Tulis naskah parodi: hook 3 detik pertama, dialog karakter, punchline, dan caption. Bahasa Indonesia, gaya kartun, satir tajam tapi lucu. Satu naskah per episode, 30–90 detik.',
    inputs: ['ideas/<tanggal>-<topik>.json dari Trend Hunter'],
    outputs: ['scripts/<tanggal>-<topik>.json — hook, naskah dialog per karakter, arahan visual, caption + judul'],
    tools: ['Claude Code / Claude API'],
    voice: 'Dialog hidup, karakter beda-beda suaranya, punchline di akhir. Jangan ceramah, jangan kaku.' },
  { id: 'voiceover', name: 'Voiceover', llm: 'Muse + TTS', stage: 'suara',
    job: 'Rekam narasi + dialog karakter pakai suara AI. Tiap karakter beda suara/intonasi. Bahasa Indonesia natural, bukan robotik.',
    inputs: ['scripts/<tanggal>-<topik>.json dari Scriptwriter'],
    outputs: ['audio/<tanggal>-<topik>/ — file audio per karakter + narasi'],
    tools: ['Library voice (sudah ada)', 'TTS / spoken-audio'],
    voice: 'Natural, ekspresif, intonasi sesuai karakter. Kalau satu suara dipakai buat semua karakter, gagal.' },
  { id: 'editor', name: 'Editor', llm: 'Muse', stage: 'edit',
    job: 'Rakit video kartun vertikal 9:16 dari naskah + audio: karakter, gerakan, subtitle, efek, musik, pacing. Render final 1080x1920.',
    inputs: ['scripts/<tanggal>-<topik>.json', 'audio/<tanggal>-<topik>/'],
    outputs: ['video/<tanggal>-<topik>/ — project Remotion + render final .mp4'],
    tools: ['toon-shorts-pack (Remotion + Three.js)', 'Blender (3D bila perlu)', 'creative-libs (anime.js, pixijs, motion-canvas, lottie, tone.js)', 'ffmpeg'],
    voice: 'Pacing cepat, subtitle selalu ada, visual hidup. Video yang bikin orang nonton sampai habis.' },
  { id: 'publisher-analyst', name: 'Publisher + Analis', llm: 'Muse + Gemini', stage: 'terbit',
    job: 'Posting ke TikTok + FB + YouTube dengan judul/caption/hashtag yang pas per platform, catat link + waktu posting. Malamnya baca analitik: mana yang viral, kenapa, jam berapa paling rame — terus kasih feedback ke Trend Hunter buat besok.',
    inputs: ['video/<tanggal>-<topik>/ final .mp4', 'scripts/<tanggal>-<topik>.json (judul + caption)'],
    outputs: ['published/<tanggal>-<topik>.json — link posting per platform + waktu', 'analytics/<tanggal>.json — views, likes, share, komentar, dan kesimpulan apa yang jalan'],
    tools: ['social-auto-upload (17 platform)', 'YouTube Studio / TikTok analytics (baca manual via browser)'],
    voice: 'Posting tepat waktu, data jujur. Kalau video flop, bilang flop dan kenapa — jangan dibagus-bagusin.' },
];

const PIPELINE = [
  { time: '06:30–08:00', stage: '1. TREND SCAN', owner: 'Trend Hunter', task: 'Scan TikTok + X + YouTube. Pilih 3 ide parodi, tulis ke ideas/.' },
  { time: '08:00–10:00', stage: '2. NASKAH', owner: 'Scriptwriter (Claude)', task: 'Tulis naskah buat ide #1 (prioritas). Hook + dialog + punchline + caption. Simpan ke scripts/.' },
  { time: '10:00–11:00', stage: '3. SUARA', owner: 'Voiceover', task: 'Rekam narasi + dialog per karakter. Simpan ke audio/<tanggal>-<topik>/.' },
  { time: '11:00–15:00', stage: '4. EDIT', owner: 'Editor', task: 'Rakit video kartun di Remotion/toon-shorts-pack. Render final .mp4 1080x1920. Review visual sebelum lanjut.' },
  { time: '15:00–16:00', stage: '5. POSTING', owner: 'Publisher', task: 'Posting ke TikTok + FB + YouTube. Catat link + waktu ke published/.' },
  { time: '20:00–21:00', stage: '6. ANALITIK', owner: 'Analis', task: 'Baca performa hari ini + video kemarin. Tulis kesimpulan ke analytics/<tanggal>.json. Feedback ke Trend Hunter buat besok.' },
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
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  toast(`${label} disalin ✓`);
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
    if (!raw) { localStorage.setItem(LS_KEY, JSON.stringify(SEED)); return [...SEED]; }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [...SEED];
  } catch { return [...SEED]; }
}
function saveEpisodes() { localStorage.setItem(LS_KEY, JSON.stringify(episodes)); }
let episodes = loadEpisodes();
const uid = () => 'ep-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- papan episode ----------
function renderBoard(animateNew = null) {
  STAGES.forEach((st) => {
    const body = $(`[data-col="${st}"]`);
    const list = episodes.filter((e) => e.stage === st);
    $(`[data-count="${st}"]`).textContent = list.length;
    body.innerHTML = '';
    if (!list.length) {
      body.innerHTML = '<div class="col-empty">Belum ada episode di tahap ini.</div>';
      return;
    }
    list.forEach((ep) => {
      const d = document.createElement('article');
      d.className = 'note';
      d.dataset.stage = ep.stage;
      d.dataset.id = ep.id;
      d.draggable = true;
      const idx = STAGES.indexOf(ep.stage);
      d.innerHTML = `<b>${esc(ep.topic)}</b><span>${esc(ep.source)} • ${esc(ep.date)}</span>
        <div class="note-actions">
          ${idx > 0 ? `<button type="button" data-move="-1" title="Ke tahap sebelumnya">‹ ${STAGE_LABEL[STAGES[idx - 1]]}</button>` : ''}
          ${idx < STAGES.length - 1 ? `<button type="button" data-move="1" title="Ke tahap berikutnya">${STAGE_LABEL[STAGES[idx + 1]]} ›</button>` : ''}
          <button type="button" class="del" data-del title="Hapus episode">✕</button>
        </div>`;
      d.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openEpisode(ep.id);
      });
      d.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', ep.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      body.appendChild(d);
      if (animateNew === ep.id) {
        animate(d, { scale: [0.6, 1], opacity: [0, 1], rotate: [-4, 0], duration: 450, ease: 'outBack' });
      }
    });
  });
  // HUD + tape
  $('#h-ep').textContent = episodes.length;
  $('#tape-count').textContent = `${episodes.length} episode di papan`;
  const done = episodes.filter((e) => e.stage === 'terbit').length;
  $('#h-barfill').style.width = (episodes.length ? (done / episodes.length) * 100 : 0) + '%';
  const now = new Date();
  const hh = now.getHours() + now.getMinutes() / 60;
  const current = PIPELINE.find((p) => {
    const [a, b] = p.time.split('–').map((s) => { const [h, m] = s.split(':').map(Number); return h + m / 60; });
    return hh >= a && hh < b;
  });
  $('#h-today').textContent = current
    ? `Sekarang: ${current.stage} — ${current.owner}`
    : 'Hari ini: Trend Scan 06:30';
  syncBoard(episodes);
  renderTeamQueues();
}
function moveEpisode(id, dir) {
  const ep = episodes.find((e) => e.id === id); if (!ep) return;
  const idx = STAGES.indexOf(ep.stage) + dir;
  if (idx < 0 || idx >= STAGES.length) return;
  ep.stage = STAGES[idx];
  saveEpisodes(); renderBoard();
}
function moveEpisodeTo(id, stage) {
  const ep = episodes.find((e) => e.id === id); if (!ep || !STAGES.includes(stage)) return;
  ep.stage = stage;
  saveEpisodes(); renderBoard();
}
function deleteEpisode(id) {
  episodes = episodes.filter((e) => e.id !== id);
  saveEpisodes(); renderBoard();
  toast('Episode dihapus');
}
function addEpisode(topic, source, angle, why) {
  const ep = { id: uid(), topic, source, angle: angle || '-', why: why || '-', stage: 'ide', date: new Date().toISOString().slice(0, 10) };
  episodes.unshift(ep);
  saveEpisodes(); renderBoard(ep.id);
  toast('Ide baru ditempel di kolom Ide 💡');
}

// drag & drop antar kolom
$$('.col-body').forEach((body) => {
  body.addEventListener('dragover', (e) => { e.preventDefault(); body.parentElement.classList.add('drag-over'); });
  body.addEventListener('dragleave', () => body.parentElement.classList.remove('drag-over'));
  body.addEventListener('drop', (e) => {
    e.preventDefault();
    body.parentElement.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    if (id) { moveEpisodeTo(id, body.dataset.col); toast(`Pindah ke ${STAGE_LABEL[body.dataset.col]}`); }
  });
});
// tombol pindah / hapus (delegasi)
$('#board').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-move], button[data-del]');
  if (!btn) return;
  const note = btn.closest('.note'); if (!note) return;
  if (btn.dataset.del !== undefined) { deleteEpisode(note.dataset.id); return; }
  moveEpisode(note.dataset.id, Number(btn.dataset.move));
});
// form ide baru
$('#idea-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const topic = $('#f-topic').value.trim();
  const source = $('#f-source').value.trim();
  if (!topic || !source) return;
  addEpisode(topic, source, $('#f-angle').value.trim(), $('#f-why').value.trim());
  e.target.reset();
  $('#f-topic').focus();
});

// ---------- karyawan ----------
function renderTeamQueues() {
  $$('.emp').forEach((card) => {
    const emp = EMPLOYEES.find((x) => x.id === card.dataset.emp);
    if (!emp) return;
    const n = episodes.filter((e) => e.stage === emp.stage).length;
    const q = $('.emp-queue', card);
    if (q) q.textContent = n ? `● ${n} episode di tahap ${STAGE_LABEL[emp.stage]}` : `○ standby — tahap ${STAGE_LABEL[emp.stage]} kosong`;
    card.classList.toggle('active', n > 0);
  });
}
function renderTeam() {
  const wrap = $('#team');
  wrap.innerHTML = '';
  EMPLOYEES.forEach((emp) => {
    const desk = DESKS.find((d) => d.id === emp.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'emp';
    b.dataset.emp = emp.id;
    b.style.setProperty('--emp-color', desk?.css ?? '#ffcf6a');
    b.innerHTML = `<div class="emp-avatar">${desk?.avatar ?? '🤖'}</div>
      <h3>${esc(emp.name)}</h3>
      <div class="emp-llm">${esc(emp.llm)}</div>
      <div class="emp-job">${esc(emp.job)}</div>
      <div class="emp-queue"></div>`;
    b.addEventListener('click', () => {
      setActiveDesk(emp.id);
      focusDesk(emp.id, false);
      openEmployee(emp.id);
    });
    wrap.appendChild(b);
  });
}

// ---------- pipeline / aturan / partner ----------
function renderPipeline() {
  $('#pipeline').innerHTML = PIPELINE.map((p) => `<li>
    <div class="p-time">${esc(p.time)}</div>
    <div class="p-stage">${esc(p.stage)}</div>
    <div class="p-task">${esc(p.task)}</div>
    <div class="p-owner">${esc(p.owner)}</div>
  </li>`).join('');
  $('#rules').innerHTML = RULES.map((r) => `<li>${esc(r)}</li>`).join('');
  $('#partners').innerHTML = PARTNERS.map((p) => `<div class="partner">
    <b>${esc(p.name)}<span class="status ${p.status}">${esc(p.label)}</span></b>
    <span>${esc(p.role)}</span>
  </div>`).join('');
}

// ---------- MCP ----------
function renderMCP() {
  $('#mcp-json').textContent = JSON.stringify(MCP_CONFIG, null, 2);
  $('#mcp-cmd').textContent = MCP_CMD;
  $('#mcp-tools').innerHTML = MCP_TOOLS.map(([n, d]) => `<li><code>${esc(n)}</code><span>${esc(d)}</span></li>`).join('');
  $$('.copy-btn').forEach((b) => b.addEventListener('click', () => {
    const el = document.getElementById(b.dataset.copy);
    copyText(el.textContent, b.textContent.includes('config') ? 'Config' : 'Perintah');
  }));
}

// ---------- modal ----------
function openModal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  animate('.modal-card', { y: [40, 0], opacity: [0, 1], duration: 350, ease: 'outQuad' });
}
function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
  setActiveDesk(null);
}
$$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
$('#modal-body').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const [act, arg, arg2] = btn.dataset.act.split(':');
  if (act === 'move') { moveEpisode(arg, Number(arg2)); closeModal(); openEpisode(arg); }
  else if (act === 'del') { deleteEpisode(arg); closeModal(); }
  else if (act === 'focus') { closeModal(); setActiveDesk(arg); focusDesk(arg, false); }
  else if (act === 'close') closeModal();
});
function openEmployee(id) {
  const emp = EMPLOYEES.find((x) => x.id === id); if (!emp) return;
  const desk = DESKS.find((d) => d.id === id);
  const queue = episodes.filter((e) => e.stage === emp.stage);
  openModal(`
    <h2>${desk?.avatar ?? ''} ${esc(emp.name)}</h2>
    <div class="m-sub">${esc(emp.llm)} • Tahap: ${STAGE_LABEL[emp.stage]}</div>
    <p>${esc(emp.job)}</p>
    <h4>Antrean di tahap ${STAGE_LABEL[emp.stage]}</h4>
    ${queue.length ? `<ul>${queue.map((e) => `<li><b>${esc(e.topic)}</b> — ${esc(e.source)}</li>`).join('')}</ul>` : '<p class="dim">Belum ada episode di tahap ini — standby.</p>'}
    <h4>Input</h4><ul>${emp.inputs.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <h4>Output</h4><ul>${emp.outputs.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
    <h4>Tools</h4><ul>${emp.tools.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <h4>Gaya kerja</h4><p>“${esc(emp.voice)}”</p>
    <div class="m-actions">
      <button type="button" class="primary" data-act="focus:${emp.id}">🎥 Fokus ke mejanya</button>
      <button type="button" data-act="close">Tutup</button>
    </div>`);
}
function openEpisode(id) {
  const ep = episodes.find((e) => e.id === id); if (!ep) return;
  const idx = STAGES.indexOf(ep.stage);
  openModal(`
    <h2>📌 ${esc(ep.topic)}</h2>
    <div class="m-sub">Tahap: ${STAGE_LABEL[ep.stage]} • ${esc(ep.date)}</div>
    <h4>Sumber tren</h4><p>${esc(ep.source)}</p>
    <h4>Angle parodi</h4><p>${esc(ep.angle)}</p>
    <h4>Kenapa layak dibuat</h4><p>${esc(ep.why)}</p>
    <div class="m-actions">
      ${idx > 0 ? `<button type="button" data-act="move:${ep.id}:-1">‹ ${STAGE_LABEL[STAGES[idx - 1]]}</button>` : ''}
      ${idx < STAGES.length - 1 ? `<button type="button" class="primary" data-act="move:${ep.id}:1">${STAGE_LABEL[STAGES[idx + 1]]} ›</button>` : ''}
      <button type="button" class="danger" data-act="del:${ep.id}">Hapus</button>
      <button type="button" data-act="close">Tutup</button>
    </div>`);
}

// ---------- animasi masuk (anime.js) ----------
function introAnimations() {
  animate('#tape', { y: [-16, 0], opacity: [0, 1], duration: 500, ease: 'outQuad' });
  animate('#stage-wrap', { opacity: [0, 1], duration: 700, delay: 150, ease: 'outQuad' });
  animate('.panel', { y: [28, 0], opacity: [0, 1], duration: 600, delay: stagger(90, { start: 250 }), ease: 'outQuad' });
  animate('footer', { opacity: [0, 1], duration: 600, delay: 600 });
}

// ---------- boot ----------
renderTeam();
renderPipeline();
renderMCP();
renderBoard();
$('#btn-reset-view').addEventListener('click', resetView);
try {
  initOffice($('#c'), $('#labels'), { onSelect: (id) => openEmployee(id) });
  syncBoard(episodes); // papan 3D ikut data episode (renderBoard jalan sebelum init)
} catch (err) {
  console.error('3D gagal dimuat:', err);
  $('#stage-hint').textContent = 'Kantor 3D tidak bisa dimuat di browser ini (butuh WebGL). Papan episode di bawah tetap jalan.';
}
introAnimations();
