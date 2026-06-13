// scripts/e2e-agent/src/reporting/markdown.js
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function buildMarkdownReport(results, mode) {
  const pass = results.filter(r => r.result === 'pass').length;
  const fail = results.filter(r => r.result === 'bug').length;
  const inc  = results.filter(r => r.result === 'inconclusive').length;

  const lines = [
    `# E2E Report — ${mode}`,
    `**Date:** ${new Date().toISOString()}`,
    `**Result:** ${pass} passed, ${fail} failed, ${inc} inconclusive\n`,
  ];

  for (const r of results) {
    if (r.result === 'bug') {
      lines.push(`### ❌ ${r.name}\n${r.description || 'No description.'}\n`);
    } else if (r.result === 'inconclusive') {
      lines.push(`### ⚠️ ${r.name}\nReached step limit (${r.steps} steps).\n`);
    } else {
      lines.push(`### ✅ ${r.name}\n`);
    }
  }

  return lines.join('\n');
}

export function saveReport(results, mode, reportsDir = 'e2e-reports') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filePath = join(reportsDir, `${ts}.md`);
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(filePath, buildMarkdownReport(results, mode));
  return filePath;
}
