// scripts/e2e-agent/src/agent/claude-cli.js
//
// Drives Claude through the locally-installed Claude Code CLI (`claude -p`),
// using the user's logged-in Pro/Max subscription — no ANTHROPIC_API_KEY and
// no metered API billing. The screenshot is handed to Claude as a file path
// and viewed via Claude Code's built-in Read tool (the CLI has no direct image
// input flag), so the directory holding it must be granted with --add-dir.
import { spawn, spawnSync } from 'child_process';

const DEFAULT_MODEL = process.env.E2E_CLAUDE_MODEL || 'opus';

/**
 * Parse the JSON envelope printed by `claude -p --output-format json` and
 * return the model's text response (its `result` field). Pure and testable —
 * no process spawning.
 *
 * @param {string} stdout raw stdout from the CLI
 * @returns {string} the model's response text
 */
export function parseCliResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`claude CLI returned non-JSON output: ${String(stdout).slice(0, 500)}`);
  }
  if (parsed.is_error || parsed.subtype !== 'success') {
    const detail = parsed.result || parsed.subtype || 'unknown error';
    throw new Error(`claude CLI reported an error: ${detail}`);
  }
  if (typeof parsed.result !== 'string') {
    throw new Error('claude CLI response had no result text');
  }
  return parsed.result;
}

/**
 * Verify the `claude` CLI is installed and runnable. Throws a helpful message
 * otherwise. Used at startup so the agent fails fast with guidance instead of
 * mid-run.
 *
 * @returns {string} the reported CLI version
 */
export function ensureClaudeCli() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new Error(
      'The `claude` CLI was not found or failed to run. Install Claude Code and sign in ' +
      'with your Claude subscription (run `claude`, then `/login`). This agent drives Claude ' +
      'through your subscription via `claude -p` — no ANTHROPIC_API_KEY required.',
    );
  }
  return (r.stdout || '').trim();
}

/**
 * Ask Claude (via `claude -p`) for the next action. The prompt is sent on
 * stdin to avoid argv length limits (the UI-element JSON can be large); the
 * system prompt and flags are passed as arguments.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt appended to Claude Code's default system prompt
 * @param {string} opts.prompt the per-step user prompt (sent on stdin)
 * @param {string} opts.addDir absolute directory granted for reading the screenshot
 * @param {string} [opts.model] model alias (default: $E2E_CLAUDE_MODEL or 'opus')
 * @returns {Promise<string>} the model's response text
 */
export function askClaude({ systemPrompt, prompt, addDir, model = DEFAULT_MODEL }) {
  const args = [
    '-p',
    '--append-system-prompt', systemPrompt,
    '--allowedTools', 'Read',
    '--add-dir', addDir,
    '--output-format', 'json',
    '--model', model,
  ];
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      reject(new Error(`failed to launch claude CLI: ${e.message}`));
      return;
    }
    child.on('error', (e) => reject(new Error(`failed to launch claude CLI: ${e.message}`)));
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${(stderr || stdout).slice(0, 500)}`));
        return;
      }
      try {
        resolve(parseCliResult(stdout));
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
