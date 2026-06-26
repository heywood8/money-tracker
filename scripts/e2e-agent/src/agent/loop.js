// scripts/e2e-agent/src/agent/loop.js
import { join, resolve } from 'path';
import { takeScreenshot, dumpUITree, tap, typeText, pressBack, swipe, isAppRunning, launchApp } from '../adb/adb.js';
import { resizeBuffer, savePng } from '../utils/screenshot.js';
import { parseUITree } from '../utils/ui-tree.js';
import { buildPrompt, parseAction, SYSTEM_PROMPT } from './prompts.js';
import { askClaude } from './claude-cli.js';

async function executeAction(device, action) {
  const cx = action.bounds ? Math.round((action.bounds[0] + action.bounds[2]) / 2) : 0;
  const cy = action.bounds ? Math.round((action.bounds[1] + action.bounds[3]) / 2) : 0;
  switch (action.action) {
  case 'tap':   tap(device, cx, cy); break;
  case 'type':  typeText(device, action.text || ''); break;
  case 'swipe': swipe(device, action.from[0], action.from[1], action.to[0], action.to[1]); break;
  case 'back':  pressBack(device); break;
  }
}

export async function runScenario(scenario, { device = null, maxSteps = 50, reportsDir = 'e2e-reports', model } = {}) {
  launchApp(device);
  const slug = scenario.name.replace(/\s+/g, '-');
  const framesDir = resolve(join(reportsDir, '.frames'));
  const framePath = join(framesDir, `${slug}.png`);
  const history = [];
  let steps = 0;

  while (steps < maxSteps) {
    const rawScreenshot = takeScreenshot(device);
    // Persist a downscaled frame so Claude can view it via the Read tool, and
    // to keep the vision token cost (and quota usage) down.
    const resized = await resizeBuffer(rawScreenshot, 0.3);
    savePng(resized, framePath);
    const uiElements = parseUITree(dumpUITree(device));

    const prompt = buildPrompt(scenario, history, uiElements, framePath);
    const responseText = await askClaude({ systemPrompt: SYSTEM_PROMPT, prompt, addDir: framesDir, model });
    const action = parseAction(responseText);

    history.push(action.observation ? `${action.action} — ${action.observation}` : action.action);
    if (history.length > 10) history.shift();

    if (action.action === 'done') {
      if (action.result === 'bug') {
        savePng(rawScreenshot, join(reportsDir, 'screenshots', `${slug}-${Date.now()}.png`));
      }
      return { result: action.result, steps: steps + 1, description: action.description || '' };
    }

    await executeAction(device, action);
    steps++;

    if (!isAppRunning(device)) {
      savePng(rawScreenshot, join(reportsDir, 'screenshots', `${slug}-crash-${Date.now()}.png`));
      launchApp(device);
      return { result: 'bug', steps, description: `App crash after action: ${JSON.stringify(action)}` };
    }
  }

  return { result: 'inconclusive', steps, description: 'Reached max step limit' };
}
