// __tests__/utils/workletDefaults.test.js
/**
 * A worklet may not take a DEFAULT PARAMETER that reads anything from outside
 * its own parameter list.
 *
 * Reanimated's Babel plugin compiles a worklet into a function whose FIRST
 * statement destructures the captured closure:
 *
 *   function clampWithRubberband(value, min, max, dimension, constant = RUBBERBAND_CONSTANT) {
 *     const { RUBBERBAND_CONSTANT, rubberband } = this.__closure;   // <- injected
 *     ...
 *   }
 *
 * Default parameters are evaluated in the parameter scope, which is OUTSIDE the
 * body — so the default reads a binding that does not exist there yet. On the UI
 * thread (Hermes) that is a hard, app-killing `ReferenceError: Property
 * 'RUBBERBAND_CONSTANT' doesn't exist`, thrown from inside the gesture handler.
 * It took down every horizontal swipe in the app (tab navigation) until it was
 * found, and nothing before this test could have caught it:
 *
 *   - Jest runs worklets as ordinary JS, where the module scope IS visible, so
 *     every unit test of the function passes.
 *   - The default only fires for callers that omit the argument, so a caller
 *     that passes one (ModalShell, on the JS thread) never sees it.
 *   - ESLint has no rule for it — the code is valid JavaScript everywhere except
 *     inside a serialized worklet.
 *
 * So the check is static: parse every source file, find the functions carrying
 * the `'worklet'` directive, and reject a default value that is anything but a
 * self-contained literal.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const APP_DIR = path.join(__dirname, '..', '..', 'app');

/** Every .js/.jsx file under app/, recursively. */
function sourceFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.jsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/**
 * Values a default parameter may safely hold: ones that need no scope at all.
 * `-1` and friends are UnaryExpressions over a literal, hence the recursion.
 */
function isSelfContained(node) {
  switch (node.type) {
  case 'NumericLiteral':
  case 'StringLiteral':
  case 'BooleanLiteral':
  case 'NullLiteral':
  case 'RegExpLiteral':
    return true;
  case 'UnaryExpression':
    return isSelfContained(node.argument);
  case 'ObjectExpression':
    return node.properties.length === 0;
  case 'ArrayExpression':
    return node.elements.length === 0;
  default:
    return false;
  }
}

function isWorklet(node) {
  return (node.body?.directives || []).some(d => d.value?.value === 'worklet');
}

function offendingDefaults(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
  });

  const offences = [];
  traverse(ast, {
    Function(pathNode) {
      if (!isWorklet(pathNode.node)) return;
      for (const param of pathNode.node.params) {
        if (param.type !== 'AssignmentPattern') continue;
        if (isSelfContained(param.right)) continue;
        const name = param.left.name || '<destructured>';
        const line = param.loc?.start.line;
        offences.push(`${path.relative(APP_DIR, filePath)}:${line} — parameter \`${name}\``);
      }
    },
  });
  return offences;
}

describe('worklet default parameters', () => {
  it('never read a binding from outside the parameter list', () => {
    const offences = sourceFiles(APP_DIR).flatMap(offendingDefaults);
    expect(offences).toEqual([]);
  });

  it('detects the shape of the bug it exists to prevent', () => {
    // Guards the guard: a rule that silently stops matching is worse than none.
    const sample = path.join(__dirname, '..', '..', 'app', 'utils', 'motion.js');
    const code = fs.readFileSync(sample, 'utf8')
      .replace('export function rubberband(overshoot, dimension, constant) {',
        'export function rubberband(overshoot, dimension, constant = RUBBERBAND_CONSTANT) {');
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
    const offences = [];
    traverse(ast, {
      Function(pathNode) {
        if (!isWorklet(pathNode.node)) return;
        for (const param of pathNode.node.params) {
          if (param.type === 'AssignmentPattern' && !isSelfContained(param.right)) {
            offences.push(param.left.name);
          }
        }
      },
    });
    expect(offences).toContain('constant');
  });
});
