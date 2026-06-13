// scripts/e2e-agent/src/agent/loop.js
import Anthropic from '@anthropic-ai/sdk';
import { join } from 'path';
import { takeScreenshot, dumpUITree, tap, typeText, pressBack, swipe, isAppRunning, launchApp } from '../android/adb.js';
import { resizeBuffer, toBase64, savePng } from '../utils/screenshot.js';
import { parseUITree } from '../utils/ui-tree.js';
import { buildMessages, parseAction, SYSTEM_PROMPT } from './prompts.js';

const client = new Anthropic();

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

export async function runScenario(scenario, { device = null, maxSteps = 50, reportsDir = 'e2e-reports' } = {}) {
  launchApp(device);
  const history = [];
  let steps = 0;

  while (steps < maxSteps) {
    const rawScreenshot = takeScreenshot(device);
    const resized = await resizeBuffer(rawScreenshot, 0.3);
    const imageBase64 = toBase64(resized);
    const uiElements = parseUITree(dumpUITree(device));

    const messages = buildMessages(scenario, history, uiElements, imageBase64);
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const responseText = response.content[0].text;
    const action = parseAction(responseText);

    history.push({ role: 'user', content: messages[messages.length - 1].content });
    history.push({ role: 'assistant', content: responseText });
    if (history.length > 20) history.splice(0, 2);

    if (action.action === 'done') {
      if (action.result === 'bug') {
        const slug = scenario.name.replace(/\s+/g, '-');
        savePng(rawScreenshot, join(reportsDir, 'screenshots', `${slug}-${Date.now()}.png`));
      }
      return { result: action.result, steps: steps + 1, description: action.description || '' };
    }

    await executeAction(device, action);
    steps++;

    if (!isAppRunning(device)) {
      const slug = scenario.name.replace(/\s+/g, '-');
      savePng(rawScreenshot, join(reportsDir, 'screenshots', `${slug}-crash-${Date.now()}.png`));
      launchApp(device);
      return { result: 'bug', steps, description: `App crash after action: ${JSON.stringify(action)}` };
    }
  }

  return { result: 'inconclusive', steps, description: 'Reached max step limit' };
}
