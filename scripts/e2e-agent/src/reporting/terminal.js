// scripts/e2e-agent/src/reporting/terminal.js

export function printHeader(mode, total) {
  process.stdout.write(`[e2e] Mode: ${mode}\n[e2e] Running ${total} scenarios\n\n`);
}

export function printScenarioResult(name, result, steps) {
  const icon = result === 'pass' ? '✅' : result === 'bug' ? '❌' : '⚠️';
  process.stdout.write(`${icon} ${name.padEnd(40)} (${steps} steps)\n`);
}

export function printSummary(results) {
  const pass = results.filter(r => r.result === 'pass').length;
  const fail = results.filter(r => r.result === 'bug').length;
  const inc  = results.filter(r => r.result === 'inconclusive').length;
  process.stdout.write(`\n[e2e] Done: ${pass} passed, ${fail} failed, ${inc} inconclusive\n`);
}
