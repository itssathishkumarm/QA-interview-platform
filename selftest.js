// Verifies the platform end to end: every reference solution must PASS and every starter must NOT pass.
// Requires Chromium (npm run setup). Uses separate ports so it can run while the server is up.
process.env.SAMPLE_PORT = '4101'; process.env.PCI_PORT = '4102';
const { QUESTIONS } = require('./lib/questions');
const { runQuestion } = require('./lib/runner');
const { startSample } = require('./sample/server');

(async () => {
  const servers = startSample(4101, 4102);
  let bad = 0;
  const only = process.argv.slice(2);
  for (const q of QUESTIONS.filter((x) => !only.length || only.includes(x.id))) {
    const sol = await runQuestion(q, q.solutionCode);
    const start = await runQuestion(q, q.starterCode);
    const okSol = sol.passed, okStart = !start.passed;
    if (!okSol || !okStart) bad++;
    console.log((okSol && okStart ? 'ok  ' : 'FAIL') + '  ' + q.id.padEnd(6) + ' solution=' + (okSol ? 'pass' : 'FAIL') + '  starter=' + (okStart ? 'fails (expected)' : 'PASSES (should fail)'));
    if (!okSol) {
      sol.checks.filter((c) => !c.passed).forEach((c) => console.log('      - ' + c.name));
      (sol.run.tests || []).filter((t) => t.error).forEach((t) => console.log('      ' + t.error.split('\n').slice(0, 6).join('\n      ')));
      if (sol.run.note) console.log('      ' + sol.run.note.split('\n').slice(0, 4).join('\n      '));
    }
  }
  console.log(bad ? '\n' + bad + ' question(s) need attention.' : '\nAll questions behave as designed.');
  servers.forEach((s) => s.close()); process.exit(bad ? 1 : 0);
})();
