// scripts/e2e-agent/src/reporting/pr-comment.js
import { execSync } from 'child_process';

export function buildPRComment(prNumber, results, totalAvailable) {
  const pass = results.filter(r => r.result === 'pass').length;
  const fail = results.filter(r => r.result === 'bug').length;
  const inc  = results.filter(r => r.result === 'inconclusive').length;

  const lines = [
    `## E2E Agent Report — PR #${prNumber}`,
    `**Scenarios run:** ${results.length} / ${totalAvailable} (scoped to changed files)`,
    `**Result:** ${fail > 0 ? `${fail} failure(s)` : 'all passed'}${inc > 0 ? `, ${inc} inconclusive` : ''}\n`,
  ];

  for (const r of results.filter(r => r.result === 'bug')) {
    lines.push(`### ❌ ${r.name} — FAILED\n${r.description || 'No description.'}\n`);
  }
  for (const r of results.filter(r => r.result === 'pass')) {
    lines.push(`### ✅ ${r.name} — passed`);
  }
  for (const r of results.filter(r => r.result === 'inconclusive')) {
    lines.push(`### ⚠️ ${r.name} — inconclusive (step limit reached)`);
  }

  return lines.join('\n');
}

export function postPRComment(prNumber, body) {
  const escaped = body.replace(/'/g, "'\\''");
  execSync(`gh pr comment ${prNumber} --repo heywood8/money-tracker --body '${escaped}'`);
}
