// scripts/e2e-agent/index.js
import { program } from 'commander';
import { ensureClaudeCli } from './src/agent/claude-cli.js';

program
  .name('e2e-agent')
  .description('Autonomous Android e2e tester for Penny')
  .requiredOption('--mode <mode>', 'pr or comprehensive')
  .option('--pr <number>', 'PR number (required for --mode pr)')
  .option('--device <serial>', 'ADB device serial (default: first connected)')
  .option('--max-steps <n>', 'Max actions per scenario', '50')
  .parse();

const opts = program.opts();

if (opts.mode === 'pr' && !opts.pr) {
  console.error('--pr <number> is required for --mode pr');
  process.exit(1);
}

// Drives Claude through the local Claude Code CLI using your subscription —
// no ANTHROPIC_API_KEY needed. Fail fast if the CLI isn't available.
try {
  ensureClaudeCli();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const maxSteps = parseInt(opts.maxSteps, 10);

if (opts.mode === 'pr') {
  const { runPRReview } = await import('./src/modes/pr-review.js');
  await runPRReview(opts.pr, { device: opts.device, maxSteps });
} else if (opts.mode === 'comprehensive') {
  const { runComprehensive } = await import('./src/modes/comprehensive.js');
  await runComprehensive({ device: opts.device, maxSteps });
} else {
  console.error('--mode must be "pr" or "comprehensive"');
  process.exit(1);
}
