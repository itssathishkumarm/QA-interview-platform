// Grades a submission: static guards + a REAL Playwright run (or a sandboxed JS run for kind "js").
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { POS5_DATASETS, pos5Reference } = require('./questions');

const ROOT = path.join(__dirname, '..');
const RUNS = path.join(ROOT, 'runs');
const strip = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '');

// Removes // and /* */ comments but leaves string/template contents alone.
function stripComments(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') out += src[i++] || ''; out += src[i++] || ''; }
      out += src[i++] || ''; continue;
    }
    out += c; i++;
  }
  return out;
}

// Candidate code runs on the interviewer's machine: block the obvious escape hatches.
const FORBIDDEN = /\brequire\s*\(|child_process|\bprocess\s*\.|from\s+['"](?:node:)?(?:fs|os|net|http|https|vm|worker_threads|child_process|cluster|dgram|dns|tls)(?:\/[^'"]*)?['"]|\beval\s*\(|new\s+Function|import\s*\(/;

let chain = Promise.resolve();
const enqueue = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

function collect(suite, out) {
  (suite.suites || []).forEach((s) => collect(s, out));
  (suite.specs || []).forEach((spec) => (spec.tests || []).forEach((t) => {
    const r = (t.results || [])[(t.results || []).length - 1] || {};
    const status = t.status === 'expected' ? 'passed' : t.status === 'skipped' ? 'skipped' : 'failed';
    const err = r.error ? r.error.message : (r.errors && r.errors[0] && r.errors[0].message) || '';
    out.push({ title: spec.title, status, durationMs: r.duration || 0, error: strip(err).slice(0, 1800) });
  }));
}

function runPlaywright(code) {
  return enqueue(() => new Promise((resolve) => {
    const id = 'r_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const dir = path.join(RUNS, id);
    fs.mkdirSync(dir, { recursive: true });
    const spec = path.join(dir, 'candidate.spec.ts');
    const report = path.join(dir, 'report.json');
    fs.writeFileSync(spec, code);
    const started = Date.now();
    let cli;
    try { cli = require.resolve('@playwright/test/cli'); } catch (e) { return resolve({ executed: false, tests: [], note: 'Playwright is not installed. Run npm install.' }); }
    const child = spawn(process.execPath, [cli, 'test', path.relative(ROOT, spec), '--reporter=json'], {
      cwd: ROOT, env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: report, CI: '1', FORCE_COLOR: '0' }
    });
    let stderr = '', stdout = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdout.on('data', (d) => { stdout += d; });
    const kill = setTimeout(() => child.kill('SIGKILL'), 75000);
    child.on('close', (codeNum) => {
      clearTimeout(kill);
      const tests = []; let note = '';
      try {
        const json = JSON.parse(fs.readFileSync(report, 'utf8'));
        (json.suites || []).forEach((s) => collect(s, tests));
        if (json.errors && json.errors.length) note = strip(json.errors.map((e) => e.message).join('\n')).slice(0, 1800);
      } catch (e) {
        note = strip(stderr || stdout).slice(-1800) || 'Playwright produced no report.';
      }
      if (!tests.length && !note) note = 'No tests were found in your file. Did you call test(...)?';
      if (/Executable doesn't exist|npx playwright install/i.test(note + stderr + tests.map((t) => t.error).join(' '))) {
        note = 'Chromium is not installed on this machine. Interviewer: run "npm run setup" and restart the server.';
        tests.forEach((t) => { t.error = ''; });
      }
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ executed: true, exitCode: codeNum, tests, note, durationMs: Date.now() - started });
    });
  }));
}

function runJs(code) {
  const out = { executed: true, tests: [], note: '' };
  let results;
  try {
    const script = code + '\n;JSON.stringify(DATASETS.map(function(d){try{return analyzePlaywrightRun(JSON.parse(JSON.stringify(d)))}catch(e){return {__error:String(e)}}}))';
    results = JSON.parse(vm.runInNewContext(script, { DATASETS: POS5_DATASETS }, { timeout: 1500 }));
  } catch (e) {
    return { executed: true, tests: [], note: 'Your code failed to run: ' + e.message };
  }
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const checkers = [
    ['failedSpecIds', 'failedSpecIds correct on all datasets', 'Filter status === "failed" and map to id (keep input order).', eq],
    ['timeoutCount', 'timeoutCount correct on all datasets (null errorMessage safe)', 'Guard against null: r.errorMessage && r.errorMessage.includes("Timeout").', eq],
    ['isReleaseBlocked', 'isReleaseBlocked correct on all datasets', 'Only FAILED results in pos/checkout block the release (flaky does not).', eq]
  ];
  out.checks = checkers.map(([key, name, hint, cmp]) => {
    let bad = null;
    POS5_DATASETS.forEach((d, i) => {
      if (bad) return;
      const got = results[i] && results[i][key], want = pos5Reference(d)[key];
      if (!cmp(got, want)) bad = 'dataset ' + (i + 1) + ': got ' + JSON.stringify(got === undefined ? (results[i] && results[i].__error) || null : got);
    });
    return { name, passed: !bad, hint: bad ? hint + ' (' + bad + ')' : hint };
  });
  return out;
}

async function runQuestion(q, code) {
  const stripped = stripComments(code);
  const checks = [];
  if (q.kind === 'playwright' && FORBIDDEN.test(stripped)) {
    return { passed: false, checks: [{ name: 'Uses only Playwright APIs', passed: false, hint: 'Node built-ins (fs, child_process, process, require, eval) are not allowed in this exercise.' }], run: { executed: false, tests: [], note: 'Blocked before execution.' } };
  }
  q.guards.forEach((g) => {
    let ok = false;
    try { ok = !!g.test(stripped); } catch (e) { ok = false; }
    checks.push({ name: g.name, passed: ok, hint: g.hint });
  });
  let run;
  if (q.kind === 'js') {
    run = runJs(code);
    (run.checks || []).forEach((c) => checks.push(c));
    delete run.checks;
  } else {
    run = await runPlaywright(code);
    const passedTests = run.tests.filter((t) => t.status === 'passed').length;
    const failedTests = run.tests.filter((t) => t.status !== 'passed').length;
    checks.push({
      name: 'Playwright run against the sample app passes (' + passedTests + ' passed, ' + failedTests + ' failed)',
      passed: run.executed && passedTests >= 1 && failedTests === 0 && !run.note,
      hint: 'See the Playwright output below.'
    });
  }
  return { passed: checks.length > 0 && checks.every((c) => c.passed), checks, run };
}

module.exports = { runQuestion, stripComments };
