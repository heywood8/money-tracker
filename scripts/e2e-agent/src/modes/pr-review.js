// scripts/e2e-agent/src/modes/pr-review.js
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { runScenario } from '../agent/loop.js';
import { matchDiffToScenarios, ALL_SCENARIOS } from '../agent/planner.js';
import { printHeader, printScenarioResult, printSummary } from '../reporting/terminal.js';
import { buildPRComment, postPRComment } from '../reporting/pr-comment.js';

const APP_MAP_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../app-map.json');

export async function runPRReview(prNumber, { device, maxSteps } = {}) {
  console.log(`[e2e] Fetching diff for PR #${prNumber}…`);
  const diff = execSync(`gh pr diff ${prNumber} --repo heywood8/money-tracker`, { encoding: 'utf8' });
  const appMap = JSON.parse(readFileSync(APP_MAP_PATH, 'utf8'));
  const scenarios = matchDiffToScenarios(diff, appMap);

  if (scenarios.length === 0) {
    console.log('[e2e] No matching scenarios for changed files. Nothing to run.');
    return;
  }

  printHeader('PR-review', scenarios.length);
  const reportsDir = 'e2e-reports';
  const results = [];

  for (const scenario of scenarios) {
    process.stdout.write(`[e2e] Running: ${scenario.name}…\n`);
    const result = await runScenario(scenario, { device, maxSteps, reportsDir });
    results.push({ ...result, name: scenario.name });
    printScenarioResult(scenario.name, result.result, result.steps);
  }

  printSummary(results);
  console.log('\n[e2e] Posting PR comment…');
  postPRComment(prNumber, buildPRComment(prNumber, results, ALL_SCENARIOS.length));
  console.log('[e2e] Done.');

  if (results.some(r => r.result === 'bug')) process.exit(1);
}
