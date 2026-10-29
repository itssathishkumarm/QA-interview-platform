// PawMart QA interview platform: portal (candidate + interviewer) + sample app + PCI frame.
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const { QUESTIONS, CATEGORIES, publicQuestion } = require('./lib/questions');
const { runQuestion } = require('./lib/runner');
const store = require('./lib/store');
const { startSample } = require('./sample/server');

const PORT = +process.env.PORTAL_PORT || 4000;
const SAMPLE = +process.env.SAMPLE_PORT || 4001;
const PCI = +process.env.PCI_PORT || 4002;
const MINUTES = +process.env.INTERVIEW_MINUTES || 45;
const SHOW_HINTS = process.env.SHOW_HINTS !== 'false';
const PIN = process.env.INTERVIEWER_PIN || String(crypto.randomInt(100000, 999999));
const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
const PUBLIC_QS = QUESTIONS.map(publicQuestion);

const app = express();

// Single-port mode: the candidate's browser only ever talks to the portal port.
const proxy = (prefix, port) => (req, res) => {
  const up = http.request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers: { ...req.headers, host: '127.0.0.1:' + port, 'x-pawmart-prefix': prefix } },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => res.status(502).send('Sample app unavailable'));
  req.pipe(up);
};
app.use('/sample', (req, res, next) => (req.originalUrl.split('?')[0] === '/sample' ? res.redirect('/sample/') : next()), proxy('/sample', SAMPLE));
app.use('/pci', proxy('/pci', PCI));

// Interviewer area is only reachable from the machine running the server (tunnels add forwarding headers).
const remote = (req) => !!(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-host']);
app.use(['/admin', '/admin.html', '/admin.js', '/api/admin'], (req, res, next) =>
  remote(req) && process.env.ALLOW_REMOTE_ADMIN !== 'true' ? res.status(403).send('The interviewer area is only available on the machine running the server.') : next());

app.use(express.json({ limit: '300kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const parseCookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const setCookie = (res, name, val, maxAgeSec) => res.append('Set-Cookie', name + '=' + encodeURIComponent(val) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSec);
const sessOf = (req) => store.get(parseCookies(req).sid);
const secEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ------------------------------------------------------------------ candidate API
const view = (s) => ({
  name: s.name, startedAt: s.startedAt, deadline: store.deadline(s), serverNow: Date.now(), finished: !!s.finishedAt,
  codes: s.codes, attempts: s.attempts, timeSpent: s.timeSpent,
  results: Object.fromEntries(Object.entries(s.results).map(([k, r]) => [k, SHOW_HINTS ? r : { ...r, checks: r.checks.map((c) => ({ ...c, hint: '' })) }]))
});
const active = (s) => !s.finishedAt && Date.now() < store.deadline(s);

app.get('/api/config', (req, res) => res.json({ samplePort: SAMPLE, minutes: MINUTES, questions: PUBLIC_QS }));
app.get('/api/session', (req, res) => { const s = sessOf(req); s ? res.json(view(s)) : res.status(404).json({ error: 'no session' }); });
app.post('/api/session', (req, res) => {
  const name = String((req.body || {}).name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const s = store.create(name, MINUTES);
  setCookie(res, 'sid', s.id, 60 * 60 * 12);
  res.json(view(s));
});
app.put('/api/code', (req, res) => {
  const s = sessOf(req); const { qid, code } = req.body || {};
  if (!s) return res.status(401).end(); if (!byId[qid] || typeof code !== 'string') return res.status(400).end();
  if (!active(s)) return res.status(409).json({ error: 'Session is over' });
  s.codes[qid] = code.slice(0, 20000); store.save(); res.json({ ok: true });
});
app.post('/api/heartbeat', (req, res) => {
  const s = sessOf(req); const { qid } = req.body || {};
  if (!s) return res.status(401).end();
  const now = Date.now();
  if (byId[qid] && active(s) && s.lastBeat) s.timeSpent[qid] = (s.timeSpent[qid] || 0) + Math.min(now - s.lastBeat, 15000) / 1000;
  s.lastBeat = now; store.save();
  res.json({ deadline: store.deadline(s), serverNow: now, finished: !!s.finishedAt });
});
app.post('/api/run', async (req, res) => {
  const s = sessOf(req); const { qid, code } = req.body || {};
  if (!s) return res.status(401).end();
  const q = byId[qid]; if (!q || typeof code !== 'string') return res.status(400).json({ error: 'Bad request' });
  if (!active(s)) return res.status(409).json({ error: 'Session is over' });
  if (s.busy) return res.status(429).json({ error: 'A run is already in progress' });
  s.busy = true;
  try {
    s.codes[qid] = code.slice(0, 20000);
    const r = await runQuestion(q, s.codes[qid]);
    s.attempts[qid] = (s.attempts[qid] || 0) + 1;
    const entry = { ...r, attempt: s.attempts[qid], at: Date.now(), timeSpentSec: Math.round(s.timeSpent[qid] || 0) };
    s.results[qid] = entry;
    s.runs.push({ qid, at: entry.at, passed: r.passed, attempt: entry.attempt });
    store.save();
    res.json(SHOW_HINTS ? entry : { ...entry, checks: entry.checks.map((c) => ({ ...c, hint: '' })) });
  } catch (e) { res.status(500).json({ error: 'Runner failed: ' + e.message }); }
  finally { s.busy = false; }
});
app.post('/api/finish', (req, res) => { const s = sessOf(req); if (!s) return res.status(401).end(); s.finishedAt = s.finishedAt || Date.now(); store.save(); res.json({ ok: true }); });

// ------------------------------------------------------------------ interviewer API
const admins = new Set(); const fails = new Map();
const isAdmin = (req) => admins.has(parseCookies(req).admin);
const needAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Interviewer login required' }));
app.post('/api/admin/login', (req, res) => {
  const ip = req.socket.remoteAddress; const f = fails.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 60000) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 5) return res.status(429).json({ error: 'Too many attempts. Wait a minute.' });
  if (!secEq((req.body || {}).pin || '', PIN)) { f.n++; fails.set(ip, f); return res.status(401).json({ error: 'Wrong PIN' }); }
  const token = crypto.randomBytes(24).toString('hex'); admins.add(token);
  setCookie(res, 'admin', token, 60 * 60 * 12); res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { admins.delete(parseCookies(req).admin); setCookie(res, 'admin', '', 0); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req) }));

const passedCount = (s) => Object.values(s.results).filter((r) => r.passed).length;
const totalTime = (s) => Object.values(s.timeSpent).reduce((a, b) => a + b, 0);
app.get('/api/admin/sessions', needAdmin, (req, res) => res.json(store.all().map((s) => ({
  id: s.id, name: s.name, startedAt: s.startedAt, finished: !!s.finishedAt, deadline: store.deadline(s),
  passed: passedCount(s), total: QUESTIONS.length, runs: s.runs.length, timeSec: Math.round(totalTime(s)), verdict: s.verdict
}))));
app.get('/api/admin/questions', needAdmin, (req, res) => res.json({ categories: CATEGORIES, questions: QUESTIONS.map((q) => ({ ...publicQuestion(q, QUESTIONS.indexOf(q), QUESTIONS), solutionCode: q.solutionCode, notes: q.notes })) }));
app.get('/api/admin/session/:id', needAdmin, (req, res) => { const s = store.get(req.params.id); s ? res.json({ ...s, deadline: store.deadline(s), serverNow: Date.now() }) : res.status(404).end(); });
app.put('/api/admin/session/:id/score', needAdmin, (req, res) => {
  const s = store.get(req.params.id); if (!s) return res.status(404).end();
  const b = req.body || {};
  s.scores = Object.fromEntries(CATEGORIES.map((c) => [c.key, Math.min(5, Math.max(1, +((b.scores || {})[c.key]) || 3))]));
  s.comments = String(b.comments || '').slice(0, 5000); s.verdict = String(b.verdict || '').slice(0, 40);
  store.save(); res.json({ ok: true });
});
app.post('/api/admin/session/:id/extend', needAdmin, (req, res) => {
  const s = store.get(req.params.id); if (!s) return res.status(404).end();
  s.extraMin = (s.extraMin || 0) + Math.min(60, Math.max(1, +(req.body || {}).minutes || 5)); s.finishedAt = null; store.save(); res.json({ deadline: store.deadline(s) });
});
const fmt = (sec) => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(Math.round(sec % 60)).padStart(2, '0');
app.get('/api/admin/report/:id', needAdmin, (req, res) => {
  const s = store.get(req.params.id); if (!s) return res.status(404).end();
  const L = ['# PawMart QA Automation Interview Evaluation', '', '**Candidate:** ' + s.name, '**Date:** ' + new Date(s.startedAt).toLocaleString(),
    '**Challenges passed:** ' + passedCount(s) + ' / ' + QUESTIONS.length, '**Total runs:** ' + s.runs.length, '**Active time:** ' + fmt(totalTime(s)),
    '**Verdict:** ' + (s.verdict || 'not set'), '', '## Per question', '| Question | Title | Status | Runs | Time |', '| :-- | :-- | :-- | --: | --: |',
    ...QUESTIONS.map((q) => { const r = s.results[q.id]; return '| ' + q.id + ' | ' + q.title + ' | ' + (r ? (r.passed ? 'PASSED' : 'FAILED') : 'NOT RUN') + ' | ' + (s.attempts[q.id] || 0) + ' | ' + fmt(s.timeSpent[q.id] || 0) + ' |'; }),
    '', '## Competency scores (1-5)', ...CATEGORIES.map((c) => '- ' + c.label + ': ' + ((s.scores || {})[c.key] || '-') + '/5'),
    '', '## Interviewer notes', s.comments || 'None.', '', '## Final code per question',
    ...QUESTIONS.map((q) => '### ' + q.id + ' ' + q.title + '\n```typescript\n' + (s.codes[q.id] || '(no code)') + '\n```\n')];
  res.set('Content-Type', 'text/markdown; charset=utf-8').set('Content-Disposition', 'attachment; filename="pawmart-qa-' + s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.md"').send(L.join('\n'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const servers = startSample(SAMPLE, PCI);
servers.push(app.listen(PORT, () => {
  console.log('\n  PawMart QA interview platform');
  console.log('  Candidate portal : http://localhost:' + PORT + '   (share THIS via a tunnel, see README)');
  console.log('  Interviewer view : http://localhost:' + PORT + '/admin   PIN: ' + PIN + (process.env.INTERVIEWER_PIN ? '' : '  (random, set INTERVIEWER_PIN to fix it)'));
  console.log('  Sample app       : http://localhost:' + SAMPLE + '   PCI frame: http://localhost:' + PCI + '\n');
}));
module.exports = { servers };
