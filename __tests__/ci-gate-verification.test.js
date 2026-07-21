// TEMPORARY VERIFICATION ARTIFACT — DO NOT MERGE.
//
// This test fails on purpose to prove that the CI test gate (added in the
// `fix/ci-gate-test-failures` branch, PR #1317) now turns the "Run Tests" check
// RED when a test fails, instead of masking the failure and reporting green.
//
// Expected CI behavior on this PR:
//   - "Run Tests" check: FAIL (red)
//   - "Test Results" sticky comment: still posted, showing "1 failed"
//
// Delete this file before merging anything.
describe('CI gate verification (intentional failure)', () => {
  it('fails on purpose to confirm the test job now gates on failures', () => {
    expect(true).toBe(false);
  });
});
