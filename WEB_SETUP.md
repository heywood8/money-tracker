# Web Development Setup

## Quick Start

1. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Start the web development server**:
   ```bash
   npm run web
   # OR
   npx expo start --web
   ```

3. **Access the app**:
   - Open your browser to http://localhost:8081
   - Or follow the URL shown in the terminal

## Expo SDK 54 Changes

Expo SDK 54 uses **Metro bundler** for web (not webpack anymore). This means:
- No need to install webpack or @expo/webpack-config
- Faster builds and better code sharing between platforms
- Same bundler for iOS, Android, and Web

## Troubleshooting

### Dependencies not installed
If you see `ConfigError: Cannot determine the project's Expo SDK version`:
```bash
npm install
```

### Metro bundler appears stuck
This is normal! Metro is waiting for browser requests. Just open http://localhost:8081 in your browser.

### Clear cache if needed
```bash
npx expo start --web --clear
```

## Required Packages for Web
- `react-dom` - React for web
- `react-native-web` - React Native components for web
- `expo` - Expo SDK

All are already listed in `package.json`.
