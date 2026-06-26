// scripts/e2e-agent/src/agent/prompts.js

export const SYSTEM_PROMPT = `You are an autonomous Android UI tester for the Penny personal finance app.

APP DETAILS:
- Package: com.heywood8.monkeep
- 5 tabs: Operations (transaction list + FAB + quick-add bar), Accounts (account list + balances), Categories (category grid), Graphs (charts), Planned (recurring transactions)
- Seed data: 3 accounts (Checking, Savings, Cash), 10 categories, ~60 operations over last 2 months, 2 monthly budgets

YOUR JOB: Execute test scenarios by interacting with the UI. Each turn you are given the file path to a screenshot of the current screen (view it with the Read tool) and a JSON list of UI elements with their pixel bounds.

RESPOND WITH EXACTLY ONE JSON object (no prose before or after):
{
  "observation": "one sentence: what you see",
  "action": "tap" | "type" | "swipe" | "back" | "done",
  "bounds": [x1, y1, x2, y2],   // for tap — always use element bounds from UI JSON
  "text": "...",                  // for type only
  "from": [x, y], "to": [x, y], // for swipe only
  "result": "pass" | "bug",      // for done only
  "description": "..."           // for done:bug — expected vs actual behavior
}

RULES:
- Use element bounds from the UI JSON for tapping, not coordinates guessed from the image
- Scenario complete and correct → {"action":"done","result":"pass"}
- Bug found (crash, wrong data, missing element) → {"action":"done","result":"bug","description":"..."}
- Stuck on same screen 3+ steps → try pressing back or tapping the Operations tab
- Always include the "observation" field`;

// Builds the per-step user prompt sent to `claude -p` on stdin. Returns a
// single string (not Anthropic message objects): the screenshot is referenced
// by file path for the Read tool, and prior actions are inlined as text since
// each CLI invocation is stateless.
export function buildPrompt(scenario, history, uiElements, screenshotPath) {
  const historyBlock = history.length
    ? `RECENT ACTIONS (oldest first):\n${history.map((h) => `- ${h}`).join('\n')}\n\n`
    : '';
  return `SCENARIO: ${scenario.name}
GOAL: ${scenario.description}

${historyBlock}A screenshot of the current screen is saved at this path:
${screenshotPath}
Use the Read tool to view it before deciding your next action.

UI ELEMENTS:
${JSON.stringify(uiElements, null, 2)}

Respond with exactly one JSON action object as described in the system prompt.`;
}

export function parseAction(responseText) {
  const match = responseText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response: ${responseText.slice(0, 200)}`);
  return JSON.parse(match[0]);
}
