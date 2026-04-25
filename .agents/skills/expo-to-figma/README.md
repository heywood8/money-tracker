# expo-to-figma

Export Expo/React Native app screens to Figma as editable vector designs.

[![Install with npx](https://img.shields.io/badge/install-npx%20skills%20add-blue)](https://skills.sh)

## Installation

```bash
npx skills add burhanusman/expo-to-figma
```

Or manually add to your Claude Code skills:
```bash
cp SKILL.md ~/.claude/skills/expo-to-figma/skill.md
```

## What It Does

This skill automates the process of capturing your Expo app screens and exporting them to Figma:

1. **Starts Expo web server** — Your app running in the browser
2. **Creates web mocks** — Handles native-only modules (expo-sqlite, etc.)
3. **Captures screens** — Uses Playwright for automated navigation
4. **Exports to Figma** — Editable vector designs via Figma MCP

## Usage

```
/expo-to-figma
```

Or natural language:
- "export my app to figma"
- "capture screens to figma"
- "send to figma"

## Requirements

- Expo project with web support
- [Figma MCP](https://www.figma.com/developers/mcp) configured
- [Playwright MCP](https://github.com/anthropics/mcp-playwright) for browser automation
- Figma account (Full/Dev seat recommended for API limits)

## Configuration

Add to your project's `CLAUDE.md`:

```markdown
## Figma

- **fileKey:** your-figma-file-key
- **fileUrl:** https://www.figma.com/design/your-file-key/Your-File
```

## Features

- **Auto web mocks** — Creates `.web.ts` files for native modules
- **Project persistence** — Always exports to the same Figma file
- **Multi-screen capture** — Capture all your app screens in one go
- **Hot reload aware** — Refreshes before capture to get latest code

## Rate Limits

| Figma Plan | Limit |
|------------|-------|
| Starter | 6/month |
| Pro + Full/Dev | 200/day |
| Enterprise | 600/day |

## License

MIT
