# Project Context

## Purpose

Penny is a React Native (Expo, Android-only) personal finance tracker: accounts,
operations, categories, budgets and graphs over a local SQLite database, with
11 UI languages, light/dark theming, backup/restore and Google Sheets export.

## Tech Stack

- Expo managed workflow (EAS Build), New Architecture enabled
- React Native + react-native-paper, react-native-reanimated 4.x / react-native-worklets
- SQLite via Drizzle ORM (`app/db/schema.js`, migrations in `drizzle/`)
- React Context for global state (`app/contexts/`)
- Jest + React Native Testing Library (`__tests__/`)

## Conventions

`CLAUDE.md` at the repository root is the authoritative guide for code layout,
design tokens (`app/styles/designTokens.js`, `componentStyles.js`), shared
selectors, the modal subpanel pattern, testing requirements and the
implement → tests green → code review → PR → CI green workflow. OpenSpec
documents *what* the app must do; `CLAUDE.md` documents *how* it is written.

Commit messages and pull request descriptions are written in English only.

## OpenSpec Layout

```
openspec/
├── project.md                 # this file
├── specs/                     # deployed capabilities (WHAT the app does today)
│   └── <capability>/spec.md
└── changes/                   # proposed changes, folded into specs/ once shipped
    └── <change-id>/
        ├── proposal.md
        ├── design.md
        ├── tasks.md
        └── specs/<capability>/spec.md   # delta
```

The `openspec` CLI is not installed in this repository; the files are written
and reviewed by hand in the formats above.
