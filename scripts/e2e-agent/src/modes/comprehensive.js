// scripts/e2e-agent/src/modes/comprehensive.js
import { runScenario } from '../agent/loop.js';
import { generateComprehensivePlan } from '../agent/planner.js';
import { printHeader, printScenarioResult, printSummary } from '../reporting/terminal.js';
import { saveReport } from '../reporting/markdown.js';

export async function runComprehensive({ device, maxSteps } = {}) {
  const scenarios = generateComprehensivePlan();
  printHeader('comprehensive', scenarios.length);
  const reportsDir = 'e2e-reports';
  const results = [];

  for (const scenario of scenarios) {
    process.stdout.write(`[e2e] Running: ${scenario.name}…\n`);
    const result = await runScenario(scenario, { device, maxSteps, reportsDir });
    results.push({ ...result, name: scenario.name });
    printScenarioResult(scenario.name, result.result, result.steps);
  }

  printSummary(results);
  const reportPath = saveReport(results, 'comprehensive', reportsDir);
  console.log(`[e2e] Report: ${reportPath}`);
}
