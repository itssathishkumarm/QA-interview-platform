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
const when = (t) => new Date(t).toLocaleString();
let meta, timer, viewing = null;

async function boot() {
  const me = await api('GET', '/api/admin/me');
  if (!me.admin) { $('login').hidden = false; return; }
  meta = await api('GET', '/api/admin/questions'); $('login').hidden = true; $('root').hidden = false; list();
}
$('signin').onclick = async () => { try { await api('POST', '/api/admin/login', { pin: $('pin').value }); $('loginErr').textContent = ''; boot(); } catch (e) { $('loginErr').textContent = e.message; } };
$('pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('signin').click(); });

// ---------------------------------------------------------------- sessions list
async function list() {
  clearInterval(timer); viewing = null;
  const draw = async () => {
    const rows = await api('GET', '/api/admin/sessions');
    const body = rows.length
      ? h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Candidate', 'Started', 'Status', 'Passed', 'Runs', 'Time', 'Verdict'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((s) => h('tr', { class: 'click', onclick: () => detail(s.id) },
          h('td', {}, s.name), h('td', {}, when(s.startedAt)), h('td', {}, s.finished ? 'Submitted' : Date.now() > s.deadline ? 'Time up' : 'In progress'),
          h('td', {}, s.passed + ' / ' + s.total), h('td', {}, s.runs), h('td', {}, fmt(s.timeSec)), h('td', {}, s.verdict || '-')))))
      : h('p', {}, 'No candidates yet. Send them to the portal URL and they will appear here.');
    $('root').replaceChildren(
      h('div', { class: 'bar2' }, h('h1', { style: 'margin:0;font-size:20px;flex:1' }, 'Candidates'), h('button', { onclick: draw }, 'Refresh'),
        h('button', { onclick: async () => { await api('POST', '/api/admin/logout'); location.reload(); } }, 'Sign out')), body);
  };
  await draw(); timer = setInterval(() => { if (!viewing) draw().catch(() => {}); }, 10000);
}

// ---------------------------------------------------------------- one candidate
async function detail(id) {
  clearInterval(timer); viewing = id;
  let s = await api('GET', '/api/admin/session/' + id);
  const scores = Object.fromEntries(meta.categories.map((c) => [c.key, (s.scores || {})[c.key] || 3]));
  const progress = h('div', {});
  const status = h('div', {});

  const drawProgress = () => {
    const passed = Object.values(s.results).filter((r) => r.passed).length;
    const left = Math.round((s.deadline - Date.now()) / 1000);
    status.replaceChildren(h('div', { class: 'chips' },
      h('span', { class: 'chip' }, s.finishedAt ? 'Submitted' : left > 0 ? 'Time left ' + fmt(left) : 'Time up'),
      h('span', { class: 'chip' }, 'Passed ' + passed + ' / ' + meta.questions.length), h('span', { class: 'chip' }, 'Runs ' + s.runs.length),
      h('span', { class: 'chip' }, 'Active ' + fmt(Object.values(s.timeSpent).reduce((a, b) => a + b, 0)))));
    progress.replaceChildren(...meta.questions.map((q) => {
      const r = s.results[q.id];
      const sol = h('pre', { class: 'code', hidden: '' }, q.solutionCode);
      return h('details', { class: 'q' },
        h('summary', {}, h('b', {}, q.id), h('span', { style: 'flex:1' }, q.title),
          h('span', { class: 'badge ' + (r ? (r.passed ? 'p' : 'f') : '') }, r ? (r.passed ? 'PASSED' : 'FAILED') : 'NOT RUN'),
          h('span', { class: 'chip' }, 'Runs ' + (s.attempts[q.id] || 0)), h('span', { class: 'chip' }, fmt(s.timeSpent[q.id] || 0))),
        h('div', { class: 'body' },
          h('p', { class: 'note' }, 'Interviewer notes: ' + q.notes),
          h('h4', {}, 'Candidate code'), h('pre', { class: 'code' }, s.codes[q.id] || '(nothing written)'),
          r ? h('div', {}, h('h4', {}, 'Last result (run ' + r.attempt + ')'), ...r.checks.map((c) => h('div', { class: 'chk ' + (c.passed ? 'p' : 'f') }, h('b', {}, c.passed ? '✓' : '✗'), c.name)),
            r.run && r.run.tests && r.run.tests.some((t) => t.error) ? h('pre', { class: 'code' }, r.run.tests.map((t) => t.error).filter(Boolean).join('\n\n')) : '') : '',
          h('button', { onclick: (e) => { sol.hidden = !sol.hidden; e.target.textContent = sol.hidden ? 'Show reference solution' : 'Hide reference solution'; } }, 'Show reference solution'), sol));
    }));
  };
  drawProgress();

  const cat = h('div', { class: 'score' }, meta.categories.map((c) => {
    const row = h('div', {});
    const paint = () => row.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', { class: scores[c.key] >= n ? 'on' : '', onclick: () => { scores[c.key] = n; paint(); } }, n)));
    paint(); return h('div', { class: 'c' }, h('div', {}, c.label + ' (' + c.questions.join(', ') + ')'), row);
  }));
  const verdict = h('select', {}, ['', 'Strong hire', 'Hire', 'Lean hire', 'Lean no hire', 'No hire'].map((v) => h('option', { value: v }, v || 'Verdict...')));
  verdict.value = s.verdict || '';
  const comments = h('textarea', { rows: 4, style: 'width:100%', placeholder: 'Private interviewer observations' }); comments.value = s.comments || '';
  const saved = h('span', { class: 'note' });
  const save = async () => { await api('PUT', '/api/admin/session/' + id + '/score', { scores, comments: comments.value, verdict: verdict.value }); saved.textContent = 'Saved ' + new Date().toLocaleTimeString(); };

  $('root').replaceChildren(
    h('div', { class: 'bar2' }, h('button', { onclick: list }, 'Back'), h('h1', { style: 'margin:0;font-size:20px;flex:1' }, s.name),
      h('button', { onclick: async () => { await api('POST', '/api/admin/session/' + id + '/extend', { minutes: 5 }); s = await api('GET', '/api/admin/session/' + id); drawProgress(); } }, 'Give +5 minutes'),
      h('a', { href: '/api/admin/report/' + id }, h('button', { class: 'primary' }, 'Export report (.md)'))),
    status, h('div', { class: 'sec' }, h('h3', {}, 'Exercises'), progress),
    h('div', { class: 'sec' }, h('h3', {}, 'Scorecard'), cat, h('div', { class: 'bar2', style: 'margin-top:10px' }, verdict), comments,
      h('div', { class: 'bar2', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: save }, 'Save scorecard'), saved)));

  timer = setInterval(async () => { // refresh progress only, never the scorecard inputs
    try { const open = [...progress.querySelectorAll('details')].map((d) => d.open); s = await api('GET', '/api/admin/session/' + id); drawProgress(); progress.querySelectorAll('details').forEach((d, i) => { d.open = open[i]; }); } catch (e) {}
  }, 10000);
}
boot();
