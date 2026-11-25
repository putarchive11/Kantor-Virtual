// Antarmuka DOM: HUD biaya, daftar agen, prompt "E", panel tugas, gerbang kode akses.
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { AGENTS, agentById } from './agents.js';
import { costs, limit, accessCode, convo, emit, on, fmtUSD } from './store.js';
import { runAgent, getModels } from './api.js';
import { fileToAgentText } from './data.js';

const $ = (id) => document.getElementById(id);
marked.setOptions({ gfm: true, breaks: true });

const state = {
  current: null, // id agen yang panelnya terbuka
  status: Object.fromEntries(AGENTS.map((a) => [a.id, a.active ? 'idle' : 'off'])),
  history: Object.fromEntries(AGENTS.map((a) => [a.id, convo.get(a.id)])),
  stream: {}, // id → teks yang sedang mengalir
  controllers: {}, // id → AbortController
  files: {}, // id → lampiran yang belum terkirim
  tier: Object.fromEntries(AGENTS.map((a) => [a.id, a.tier ?? 'hemat'])),
  models: null, // [{tier,label,provider}] dari server; null = belum dimuat
  near: null,
};

/* ------------------------------------------------------------------ util */

const ARABIC_RUN = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿][؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿\sً-ٰٟـ.,،؛؟!:()«»"'0-9٠-٩]*[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿ً-ٰٟ)»]/g;
const ARABIC_CHAR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;

/** Teks Arab: blok yang mayoritas Arab dibuat RTL penuh, potongan Arab di kalimat Latin dibungkus span RTL. */
function decorateArabic(root) {
  root.querySelectorAll('p, li, td, th, blockquote, h1, h2, h3, h4').forEach((el) => {
    const t = el.textContent.replace(/\s/g, '');
    const ar = (t.match(ARABIC_CHAR) || []).length;
    if (t.length && ar / t.length > 0.6) {
      el.classList.add('arab');
      el.setAttribute('dir', 'rtl');
    }
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.parentElement.closest('.arab, code, pre')) continue;
    if (ARABIC_CHAR.test(n.nodeValue)) nodes.push(n);
    ARABIC_CHAR.lastIndex = 0;
  }
  for (const n of nodes) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const s = n.nodeValue;
    for (const m of s.matchAll(ARABIC_RUN)) {
      if (m.index > last) frag.append(s.slice(last, m.index));
      const span = document.createElement('span');
      span.className = 'arab';
      span.dir = 'rtl';
      span.textContent = m[0];
      frag.append(span);
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    frag.append(s.slice(last));
    n.replaceWith(frag);
  }
}

function renderMarkdown(el, text, final) {
  el.innerHTML = DOMPurify.sanitize(marked.parse(text));
  el.querySelectorAll('table').forEach((t) => {
    const w = document.createElement('div');
    w.className = 'table-wrap';
    t.replaceWith(w);
    w.append(t);
  });
  el.querySelectorAll('a').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  if (final) decorateArabic(el);
}

export function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

const statusLabel = { idle: 'siap', working: 'bekerja…', done: 'tugas selesai', off: 'segera hadir' };

function setStatus(id, status) {
  state.status[id] = status;
  emit('agent-status', { id, status });
  renderRoster();
}

/* ------------------------------------------------------------------ HUD */

function renderCosts() {
  const today = costs.today();
  const lim = limit.get();
  $('cost-today').textContent = fmtUSD(today);
  $('cost-limit').textContent = '$' + lim.toFixed(2);
  $('cost-month').textContent = fmtUSD(costs.month());
  const pct = Math.min(100, (today / lim) * 100);
  const m = $('cost-meter');
  m.style.width = pct + '%';
  m.className = pct >= 100 ? 'over' : pct >= 75 ? 'warn' : '';
}

function renderRoster() {
  const ul = $('roster');
  ul.innerHTML = '';
  for (const a of AGENTS) {
    const st = state.status[a.id];
    const li = document.createElement('li');
    if (!a.active) li.className = 'inactive';
    li.innerHTML = `<button type="button"><span class="r-icon"></span><span class="r-text"><span class="r-name"></span><span class="r-status"><i class="dot"></i><span></span></span></span></button>`;
    li.querySelector('.r-icon').textContent = a.icon;
    li.querySelector('.r-name').textContent = a.short;
    li.querySelector('.dot').className = 'dot ' + (st === 'idle' ? '' : st);
    li.querySelector('.r-status span').textContent = statusLabel[st];
    li.querySelector('button').title = `${a.name} — ${a.role}`;
    li.querySelector('button').addEventListener('click', () => emit('go-to-agent', a.id));
    ul.append(li);
  }
}

function setupLimitPop() {
  const pop = $('limit-pop');
  $('hud-cost').addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      $('limit-input').value = limit.get().toFixed(2);
      $('limit-input').focus();
    }
  });
  const save = () => {
    limit.set($('limit-input').value);
    pop.hidden = true;
    toast(`Batas harian diatur ke $${limit.get().toFixed(2)}.`);
  };
  $('limit-save').addEventListener('click', save);
  $('limit-input').addEventListener('keydown', (e) => e.key === 'Enter' && save());
}

/* ------------------------------------------------------------------ gate */

function askCode(errorMsg) {
  return new Promise((resolve) => {
    const gate = $('gate');
    const input = $('gate-input');
    $('gate-error').hidden = !errorMsg;
    $('gate-error').textContent = errorMsg ?? '';
    input.value = '';
    gate.hidden = false;
    setTimeout(() => input.focus(), 30);
    const done = (v) => {
      gate.hidden = true;
      $('gate-form').onsubmit = null;
      $('gate-cancel').onclick = null;
      resolve(v);
    };
    $('gate-form').onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      accessCode.set(v);
      done(v);
    };
    $('gate-cancel').onclick = () => done(null);
  });
}

/* ------------------------------------------------------------------ panel */

function bubble(role, cls = '') {
  const d = document.createElement('div');
  d.className = `msg ${role} ${cls}`.trim();
  return d;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function assistantBubble(agent, m, idx) {
  const d = bubble('assistant');
  const body = document.createElement('div');
  body.className = 'md';
  renderMarkdown(body, m.content, true);
  d.append(body);
  const tools = document.createElement('div');
  tools.className = 'msg-tools';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Salin';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      copy.textContent = 'Tersalin ✓';
      setTimeout(() => (copy.textContent = 'Salin'), 1500);
    } catch {
      toast('Browser menolak akses clipboard.');
    }
  };
  const dl = document.createElement('button');
  dl.type = 'button';
  dl.textContent = 'Unduh .md';
  dl.onclick = () => download(`${agent.id}-${new Date().toISOString().slice(0, 10)}-${idx}.md`, m.content);
  tools.append(copy, dl);
  if (m.meta) {
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = [m.meta.model, m.meta.mock ? 'uji' : m.meta.free ? 'gratis' : fmtUSD(m.meta.cost ?? 0), m.meta.truncated ? 'terpotong' : '']
      .filter(Boolean)
      .join(' · ');
    tools.append(meta);
  }
  d.append(tools);
  return d;
}

function renderMessages() {
  const agent = agentById(state.current);
  const box = $('messages');
  box.innerHTML = '';
  if (!agent) return;

  if (!agent.active) {
    box.innerHTML = `<div class="empty"><span class="big"></span><b></b><br>Meja ini sudah disiapkan. Agen akan aktif di versi berikutnya.</div>`;
    box.querySelector('.big').textContent = agent.icon;
    box.querySelector('b').textContent = agent.name;
    return;
  }

  const hist = state.history[agent.id];
  if (hist.length === 0 && state.stream[agent.id] == null) {
    const g = bubble('assistant');
    const md = document.createElement('div');
    md.className = 'md';
    renderMarkdown(md, agent.greeting, true);
    g.append(md);
    box.append(g);
  }
  hist.forEach((m, i) => {
    if (m.role === 'user') {
      const d = bubble('user');
      d.textContent = m.display ?? m.content;
      if (m.file) {
        const tag = document.createElement('div');
        tag.className = 'file-tag';
        tag.textContent = `📎 ${m.file.name} · ${m.file.rows.toLocaleString('id-ID')} baris`;
        d.append(tag);
      }
      box.append(d);
    } else box.append(assistantBubble(agent, m, i));
  });

  if (state.stream[agent.id] != null) {
    const d = bubble('assistant', 'live');
    const md = document.createElement('div');
    md.className = 'md';
    d.append(md);
    const s = state.stream[agent.id];
    if (s) renderMarkdown(md, s, false);
    else md.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    box.append(d);
  }
  renderConvoCost();
  box.scrollTop = box.scrollHeight;
}

let liveFrame = 0;
function scheduleLive(id) {
  if (state.current !== id || liveFrame) return;
  liveFrame = requestAnimationFrame(() => {
    liveFrame = 0;
    const md = document.querySelector('#messages .live .md');
    if (!md || state.stream[id] == null) return;
    const box = $('messages');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    renderMarkdown(md, state.stream[id] || '…', false);
    if (atBottom) box.scrollTop = box.scrollHeight;
  });
}

function renderConvoCost() {
  const agent = agentById(state.current);
  if (!agent) return;
  const sum = state.history[agent.id].reduce((s, m) => s + (m.meta?.cost ?? 0), 0);
  $('convo-cost').textContent = sum > 0 ? `percakapan ini ${fmtUSD(sum)}` : '';
}

function renderAttach() {
  const f = state.files[state.current];
  $('attach-chip').hidden = !f;
  if (f) {
    $('attach-text').textContent = `📎 ${f.name} · ${f.rows.toLocaleString('id-ID')} baris · ${Math.round(f.chars / 1000)} rb karakter${f.cut ? ' (dipotong)' : ''}`;
  }
}

function fillTierSelect(agent) {
  const sel = $('tier');
  sel.innerHTML = '';
  const models = state.models;
  if (!models) {
    sel.append(new Option('Memuat model…', ''));
    sel.disabled = true;
    return;
  }
  if (models.length === 0) {
    sel.append(new Option('Belum ada API key', ''));
    sel.disabled = true;
    return;
  }
  for (const m of models) sel.append(new Option(m.label, m.tier));
  // Pakai pilihan terakhir bila masih tersedia; kalau tidak, model pertama (gratis didahulukan).
  if (!models.some((m) => m.tier === state.tier[agent.id])) {
    const prefer = agent.tier && models.find((m) => m.tier === agent.tier);
    state.tier[agent.id] = (prefer ?? models[0]).tier;
  }
  sel.value = state.tier[agent.id];
  sel.disabled = !agent.active;
}

function renderComposer() {
  const agent = agentById(state.current);
  const busy = !!state.controllers[agent.id];
  const disabled = !agent.active;
  $('input').disabled = disabled;
  fillTierSelect(agent);
  $('attach-label').classList.toggle('disabled', disabled || !agent.acceptsFile);
  $('send').disabled = disabled;
  $('send').textContent = busy ? 'Stop ■' : 'Kirim ➤';
  $('panel-new').disabled = disabled;
}

export function openPanel(id) {
  const agent = agentById(id);
  if (!agent) return;
  state.current = id;
  document.body.classList.add('panel-open');
  $('panel').setAttribute('aria-hidden', 'false');
  $('panel-icon').textContent = agent.icon;
  $('panel-name').textContent = agent.name;
  $('panel-role').textContent = agent.role;
  const chips = $('panel-chips');
  chips.innerHTML = '';
  for (const q of agent.quick ?? []) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip';
    c.textContent = q.label;
    c.onclick = () => {
      $('input').value = q.text;
      $('input').focus();
      const pos = q.text.indexOf('…');
      if (pos >= 0) $('input').setSelectionRange(pos, pos + 1);
    };
    chips.append(c);
  }
  if (state.status[id] === 'done') setStatus(id, 'idle');
  renderMessages();
  renderAttach();
  renderComposer();
  if (agent.active && matchMedia('(pointer: fine)').matches) setTimeout(() => $('input').focus(), 320);
  emit('panel-opened', id);
}

export function closePanel() {
  if (!state.current) return;
  state.current = null;
  document.body.classList.remove('panel-open');
  $('panel').setAttribute('aria-hidden', 'true');
  document.activeElement?.blur();
  emit('panel-closed');
}

export const isPanelOpen = () => state.current !== null;

async function send() {
  const agent = agentById(state.current);
  if (!agent?.active) return;
  const id = agent.id;

  if (state.controllers[id]) {
    state.controllers[id].abort();
    return;
  }

  const text = $('input').value.trim();
  const file = state.files[id];
  if (!text && !file) {
    $('input').focus();
    return;
  }
  if (state.models && state.models.length === 0) {
    toast('Belum ada API key AI di server. Isi GEMINI_API_KEY (gratis) di Vercel → Settings → Environment Variables, lalu redeploy.', 7000);
    return;
  }
  if (costs.today() >= limit.get()) {
    toast(`Batas biaya hari ini ($${limit.get().toFixed(2)}) tercapai. Naikkan batas lewat kotak biaya di kiri atas bila perlu.`, 5000);
    return;
  }
  let code = accessCode.get();
  if (!code) {
    code = await askCode();
    if (!code) return;
  }

  const prompt = text || 'Tolong analisis file terlampir.';
  const userMsg = {
    role: 'user',
    content: file ? `${prompt}\n\n[Lampiran: ${file.name}]\n${file.text}` : prompt,
    display: prompt,
    ...(file ? { file: { name: file.name, rows: file.rows } } : {}),
  };
  const hist = state.history[id];
  hist.push(userMsg);
  $('input').value = '';
  delete state.files[id];
  renderAttach();

  const tier = state.tier[id];
  const attempt = async (codeToUse, retried) => {
    const ctrl = new AbortController();
    state.controllers[id] = ctrl;
    state.stream[id] = '';
    setStatus(id, 'working');
    if (state.current === id) {
      renderMessages();
      renderComposer();
    }
    try {
      const r = await runAgent({
        agentId: id,
        tier,
        code: codeToUse,
        signal: ctrl.signal,
        messages: hist.map(({ role, content }) => ({ role, content })),
        onDelta: (t) => {
          state.stream[id] += t;
          scheduleLive(id);
        },
      });
      if (!r.text.trim()) throw Object.assign(new Error('Agen tidak mengembalikan jawaban.'), { status: 502 });
      hist.push({ role: 'assistant', content: r.text, meta: { cost: r.cost, model: r.model, truncated: r.truncated, mock: r.mock, free: r.free } });
      costs.add(r.cost);
      if (r.truncated) toast('Jawaban terpotong karena terlalu panjang. Ketik "lanjutkan" untuk meneruskan.', 5000);
      return 'ok';
    } catch (e) {
      if (e.status === 401 && !retried) {
        accessCode.clear();
        delete state.controllers[id];
        const again = await askCode('Kode akses salah. Coba lagi.');
        if (again) return attempt(again, true);
      }
      const partial = e.partial ?? (e.name === 'AbortError' ? state.stream[id] : '');
      delete state.stream[id];
      if (e.cost) costs.add(e.cost);
      if (partial?.trim()) {
        const note = e.name === 'AbortError' ? '\n\n_(dihentikan)_' : `\n\n_(terputus: ${e.message})_`;
        hist.push({ role: 'assistant', content: partial + note, meta: { cost: e.cost ?? 0, model: '', truncated: true } });
        return 'partial';
      }
      // Gagal total: kembalikan pesan ke kotak input supaya tidak hilang.
      hist.pop();
      $('input').value = prompt;
      if (userMsg.file && file) state.files[id] = file;
      if (e.name !== 'AbortError') {
        toast(e.message, 6000);
        if (state.current === id) {
          renderMessages();
          const err = bubble('error');
          err.textContent = '⚠️ ' + e.message;
          $('messages').append(err);
        }
      }
      return 'fail';
    } finally {
      if (state.controllers[id] === ctrl) {
        delete state.controllers[id];
        delete state.stream[id];
      }
    }
  };

  const result = await attempt(code, false);
  convo.set(id, hist);
  setStatus(id, result === 'fail' ? 'idle' : state.current === id ? 'idle' : 'done');
  if (state.current === id) {
    if (result !== 'fail') renderMessages();
    renderAttach();
    renderComposer();
  } else if (result !== 'fail') {
    toast(`${agent.icon} ${agent.name} selesai mengerjakan tugas.`);
  }
}

function setupPanel() {
  $('panel-close').addEventListener('click', closePanel);
  $('panel-new').addEventListener('click', () => {
    const id = state.current;
    if (!id || state.controllers[id]) return;
    if (state.history[id].length && !confirmInline()) return;
    state.history[id] = [];
    convo.clear(id);
    renderMessages();
    toast('Percakapan baru dimulai.');
  });
  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  $('tier').addEventListener('change', (e) => {
    if (state.current) state.tier[state.current] = e.target.value;
  });
  $('file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !state.current) return;
    const id = state.current;
    try {
      $('attach-chip').hidden = false;
      $('attach-text').textContent = `Membaca ${f.name}…`;
      state.files[id] = await fileToAgentText(f);
      if (state.files[id].cut) toast('File besar: tabel dipotong, ringkasan numerik tetap dari semua baris.', 5000);
    } catch (err) {
      delete state.files[id];
      toast(err.message, 5000);
    }
    if (state.current === id) renderAttach();
  });
  $('attach-remove').addEventListener('click', () => {
    delete state.files[state.current];
    renderAttach();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('limit-pop').hidden) $('limit-pop').hidden = true;
      else if (isPanelOpen() && $('gate').hidden) closePanel();
    }
  });
}

// Konfirmasi "percakapan baru" tanpa dialog bawaan browser: klik dua kali dalam 3 detik.
let confirmUntil = 0;
function confirmInline() {
  if (Date.now() < confirmUntil) return true;
  confirmUntil = Date.now() + 3000;
  toast('Klik ⟲ sekali lagi untuk menghapus percakapan ini.');
  return false;
}

/* ------------------------------------------------------------------ prompt */

function setupPrompt() {
  const p = $('prompt');
  on('near-agent', (id) => {
    state.near = id;
    const a = agentById(id);
    if (!a) {
      p.hidden = true;
      return;
    }
    p.innerHTML = '<kbd>E</kbd> ';
    p.append(a.active ? `Beri tugas ke ${a.name}` : `${a.name} · segera hadir`);
    p.hidden = false;
  });
  p.addEventListener('click', () => state.near && openPanel(state.near));
}

/* ------------------------------------------------------------------ init */

async function loadModels() {
  const info = await getModels();
  state.models = info?.models ?? [];
  if (state.current) renderComposer();
  if (info && !info.passcode) toast('Server belum diatur: OFFICE_PASSCODE kosong di Vercel.', 6000);
}

export function initUI() {
  loadModels();
  renderCosts();
  renderRoster();
  setupLimitPop();
  setupPanel();
  setupPrompt();
  on('costs-changed', renderCosts);
  on('open-agent', openPanel);
  on('player-moved', () => setTimeout(() => $('hint').classList.add('fade'), 6000));
  // Status awal ke scene (mis. agen "done" dari sesi sebelumnya tidak dibawa).
  for (const a of AGENTS) emit('agent-status', { id: a.id, status: state.status[a.id] });
  window.addEventListener('storage', renderCosts);
}

export const getStatus = (id) => state.status[id];
