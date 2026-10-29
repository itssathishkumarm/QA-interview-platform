const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v); });
  kids.flat().forEach((k) => e.append(k instanceof Node ? k : document.createTextNode(k == null ? '' : String(k))));
  return e;
}
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
};
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');

let cfg, st, qs, track = 'dotcom', cur = null, offset = 0, over = false, loading = false, saveT;

// ---------------------------------------------------------------- editor (Monaco with textarea fallback)
const Ed = {
  mon: null, ta: $('ta'),
  get() { return this.mon ? this.mon.getValue() : this.ta.value; },
  set(v) { loading = true; this.mon ? this.mon.setValue(v) : (this.ta.value = v); loading = false; },
  lock(b) { this.mon ? this.mon.updateOptions({ readOnly: b }) : (this.ta.readOnly = b); }
};
Ed.ta.addEventListener('input', () => onEdit());
Ed.ta.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return; e.preventDefault();
  const t = Ed.ta, s = t.selectionStart; t.value = t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 2; onEdit();
});
function loadMonaco() {
  const base = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs';
  const s = document.createElement('script'); s.src = base + '/loader.js';
  const giveUp = setTimeout(() => { s.onload = null; }, 5000);
  s.onload = () => {
    window.require.config({ paths: { vs: base } });
    window.require(['vs/editor/editor.main'], () => {
      clearTimeout(giveUp);
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
      const code = Ed.get(); Ed.ta.hidden = true;
      Ed.mon = monaco.editor.create($('editor'), { value: code, language: 'typescript', theme: 'vs', minimap: { enabled: false }, fontSize: 13, automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2 });
      Ed.mon.onDidChangeModelContent(() => onEdit());
      Ed.lock(over);
    });
  };
  document.head.appendChild(s);
}
function onEdit() {
  if (loading || !cur) return;
  st.codes[cur.id] = Ed.get();
  clearTimeout(saveT); const id = cur.id;
  saveT = setTimeout(() => api('PUT', '/api/code', { qid: id, code: st.codes[id] }).catch(() => {}), 800);
}

// ---------------------------------------------------------------- boot
async function boot() {
  cfg = await api('GET', '/api/config'); qs = cfg.questions;
  try { st = await api('GET', '/api/session'); enter(); } catch (e) { $('start').hidden = false; }
}
$('go').onclick = async () => {
  try { st = await api('POST', '/api/session', { name: $('name').value }); $('start').hidden = true; enter(); } catch (e) { $('startErr').textContent = e.message; }
};
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });

function enter() {
  $('start').hidden = true; $('app').hidden = false;
  if (st.finished) return showDone();
  offset = st.serverNow - Date.now();
  loadMonaco();
  select(qs[0].id);
  setInterval(tick, 1000); tick();
  setInterval(beat, 5000);
}
const showDone = () => { $('app').hidden = true; $('done').hidden = false; };

// ---------------------------------------------------------------- header
const inTrack = () => qs.filter((q) => q.track === track);
function renderBar() {
  const n = (t) => qs.filter((q) => q.track === t && st.results[q.id] && st.results[q.id].passed).length;
  const tot = (t) => qs.filter((q) => q.track === t).length;
  $('tabs').replaceChildren(
    ...[['dotcom', 'Pet DotCom'], ['pos', 'Vet POS']].map(([t, label]) =>
      h('button', { class: track === t ? 'on' : '', onclick: () => { track = t; select(inTrack()[0].id); } }, label + ' ' + n(t) + '/' + tot(t))));
  $('pills').replaceChildren(...inTrack().map((q) => {
    const r = st.results[q.id];
    return h('button', { class: [cur && cur.id === q.id ? 'on' : '', r ? (r.passed ? 'pass' : 'fail') : ''].join(' '), title: q.title, onclick: () => select(q.id) }, q.id);
  }));
}
function tick() {
  const left = Math.floor((st.deadline - (Date.now() + offset)) / 1000);
  $('timer').textContent = fmt(Math.max(0, left)); $('timer').classList.toggle('low', left < 300);
  if (left <= 0 && !over) lock('Time is up. Your last saved code has been submitted.');
  if (cur && !over && document.visibilityState === 'visible') { st.timeSpent[cur.id] = (st.timeSpent[cur.id] || 0) + 1; $('tspent').textContent = fmt(st.timeSpent[cur.id]); }
}
async function beat() {
  if (over || !cur) return;
  try { const r = await api('POST', '/api/heartbeat', { qid: cur.id }); st.deadline = r.deadline; offset = r.serverNow - Date.now(); if (r.finished) { lock('This session was closed by the interviewer.'); } } catch (e) {}
}
function lock(msg) {
  over = true; Ed.lock(true); $('run').disabled = true; $('reset').disabled = true;
  $('banner').textContent = msg; $('banner').hidden = false;
}

// ---------------------------------------------------------------- question view
function select(id) {
  if (cur && !loading) { st.codes[cur.id] = Ed.get(); api('PUT', '/api/code', { qid: cur.id, code: st.codes[cur.id] }).catch(() => {}); }
  cur = qs.find((q) => q.id === id); track = cur.track; renderBar();
  const q = cur;
  $('qhead').replaceChildren(
    h('div', { class: 'chips' }, h('span', { class: 'chip' }, q.id + ' (' + q.trackNum + ' of ' + inTrack().length + ')'), h('span', { class: 'chip' }, q.difficulty), h('span', { class: 'chip' }, q.topic),
      h('span', { class: 'chip', id: 'runs' }, 'Runs ' + (st.attempts[q.id] || 0)), h('span', { class: 'chip', id: 'tspent' }, fmt(st.timeSpent[q.id] || 0))),
    h('h2', {}, q.title), h('p', {}, q.scenario),
    h('ul', {}, q.requirements.map((r) => h('li', {}, r))), q.note ? h('div', { class: 'note' }, q.note) : '');
  $('hint').textContent = 'Where to look: ' + q.hint;
  $('file').textContent = q.kind === 'js' ? 'analyze.js (runs server-side)' : 'tests/' + q.id.toLowerCase() + '.spec.ts';
  Ed.set(st.codes[q.id] != null ? st.codes[q.id] : q.starterCode);
  setApp(q.appPath); renderResult(st.results[q.id]);
}
function setApp(path) {
  $('noApp').hidden = path != null; $('appFrame').hidden = path == null; $('reloadApp').disabled = path == null;
  if (path == null) { $('appPath').textContent = '(no UI)'; $('openApp').removeAttribute('href'); return; }
  const url = '/sample' + (path === '/' ? '/' : path);
  $('appPath').textContent = path; $('openApp').href = url;
  if ($('appFrame').dataset.url !== url) { $('appFrame').src = url; $('appFrame').dataset.url = url; }
}
$('reloadApp').onclick = () => { $('appFrame').src = $('appFrame').dataset.url; };
$('reset').onclick = () => { if (confirm('Reset this exercise to the starter code?')) { Ed.set(cur.starterCode); onEdit(); } };

// ---------------------------------------------------------------- run + results
$('run').onclick = async () => {
  const q = cur, btn = $('run'); btn.disabled = true; btn.textContent = 'Running...';
  $('out').replaceChildren(h('div', { class: 'empty' }, q.kind === 'js' ? 'Running your function...' : 'Running Playwright in a real browser. This takes a few seconds...'));
  try {
    const r = await api('POST', '/api/run', { qid: q.id, code: Ed.get() });
    st.results[q.id] = r; st.attempts[q.id] = r.attempt;
    if (cur.id === q.id) { renderResult(r); $('runs').textContent = 'Runs ' + r.attempt; }
    renderBar();
  } catch (e) {
    if (e.status === 409) lock('Time is up. Your last saved code has been submitted.');
    $('out').replaceChildren(h('div', { class: 'err' }, e.message));
  }
  btn.disabled = over; btn.textContent = 'Run test';
};
function renderResult(r) {
  const out = $('out');
  if (!r) return out.replaceChildren(h('div', { class: 'empty' }, 'Press Run test to check your solution.'));
  const kids = [h('div', { class: 'verdict ' + (r.passed ? 'ok' : 'no') }, (r.passed ? 'Passed' : 'Not yet') + ' (run ' + r.attempt + ')')];
  r.checks.forEach((c) => kids.push(h('div', { class: 'chk ' + (c.passed ? 'p' : 'f') }, h('b', {}, c.passed ? '✓' : '✗'), h('div', {}, c.name, !c.passed && c.hint ? h('div', { class: 'h' }, c.hint) : ''))));
  const run = r.run;
  if (run && run.executed && (run.tests.length || run.note)) {
    const box = h('div', { class: 'runbox' }, h('h4', {}, 'Playwright output' + (run.durationMs ? ' (' + (run.durationMs / 1000).toFixed(1) + 's)' : '')));
    run.tests.forEach((t) => { box.append(h('div', { class: 't ' + (t.status === 'passed' ? 'p' : 'f') }, (t.status === 'passed' ? '✓ ' : '✗ ') + t.title)); if (t.error) box.append(h('pre', {}, t.error)); });
    if (run.note) box.append(h('pre', {}, run.note));
    kids.push(box);
  } else if (run && run.note) kids.push(h('div', { class: 'note' }, run.note));
  out.replaceChildren(...kids);
}
$('finish').onclick = async () => {
  if (!confirm('Finish and submit? You will not be able to change your answers.')) return;
  if (cur) await api('PUT', '/api/code', { qid: cur.id, code: Ed.get() }).catch(() => {});
  await api('POST', '/api/finish'); showDone();
};
boot();
