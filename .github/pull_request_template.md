<!--
  PR title = changelog entry. It MUST follow Conventional Commits — the
  "PR Title Check" workflow enforces it, and release-please turns the squashed
  title into the release notes. Pick one type:
    feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert
  Scope is optional. Common scopes: (search) (settings) (operations) (accounts)
  (graphs) (android) (updates) (geo) (e2e).
  Example:  fix(search): fold Cyrillic ё/е in the SQL fallback
-->

## Summary

<!-- What changed and why, in 1–3 sentences.
     Bug fix? Lead with the problem and its root cause. -->

## Changes

<!-- File-keyed bullets describing what you actually changed, e.g.
- **app/screens/AccountsScreen.js** — show a ⭐ on the default-account row.
- **assets/i18n/*.json** — add `default_account_hint` for all 11 languages. -->

-

## Testing

<!-- Required. Paste the exact command(s) and the result, e.g.
     `npm test` — 135 suites / 3955 tests pass.
     Add any manual or on-device steps you ran. -->

-

## Checklist

- [ ] Title follows Conventional Commits (`type(scope): subject`)
- [ ] `npm test` is green (all suites pass)
- [ ] User-facing strings updated in **all 11** `assets/i18n/*.json` files — or n/a
- [ ] Linked the related issue with `Closes #NNN` below — or n/a

Closes #

<!-- Tips:
     • UI change? Comment `/screenshots` on the PR to attach light & dark captures.
     • Want a device smoke-test? Run `/verify-pr <number>` — it derives E2E
       scenarios from this description, so be specific in Summary/Changes above. -->
