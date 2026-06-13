import { ALL_SCENARIOS, matchDiffToScenarios, generateComprehensivePlan } from '../src/agent/planner.js';

describe('ALL_SCENARIOS', () => {
  it('has at least 15 scenarios', () => { expect(ALL_SCENARIOS.length).toBeGreaterThanOrEqual(15); });
  it('each has name and description', () => {
    ALL_SCENARIOS.forEach(s => {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    });
  });
});

describe('matchDiffToScenarios', () => {
  const appMap = {
    'app/contexts/Operations*': ['add-operation', 'operations-list'],
    'app/screens/AccountsScreen*': ['accounts-list'],
  };

  it('returns scenarios for matching changed files', () => {
    const diff = 'diff --git a/app/contexts/OperationsActionsContext.js b/app/contexts/OperationsActionsContext.js\nindex abc..def 100644';
    const result = matchDiffToScenarios(diff, appMap);
    expect(result.some(s => s.id === 'add-operation')).toBe(true);
  });

  it('returns empty array for unmatched files', () => {
    expect(matchDiffToScenarios('diff --git a/docs/README.md b/docs/README.md', appMap)).toHaveLength(0);
  });

  it('deduplicates scenarios', () => {
    const diff = 'diff --git a/app/contexts/OperationsActionsContext.js b/x\ndiff --git a/app/contexts/OperationsDataContext.js b/y';
    const map = {
      'app/contexts/OperationsActions*': ['add-operation'],
      'app/contexts/OperationsData*': ['add-operation', 'operations-list'],
    };
    const result = matchDiffToScenarios(diff, map);
    expect(result.filter(s => s.id === 'add-operation')).toHaveLength(1);
  });
});

describe('generateComprehensivePlan', () => {
  it('returns all scenarios', () => { expect(generateComprehensivePlan()).toEqual(ALL_SCENARIOS); });
});
