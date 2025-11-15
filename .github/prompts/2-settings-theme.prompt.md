## Plan: Add Settings Button & Theme Switcher

Add a "Settings" (hamburger) button to the top-right corner of the app. Tapping it opens a settings screen/modal with a single option: switch between Dark, Light, or System color scheme. This improves user experience by allowing theme customization.

### Steps
1. Add a hamburger "Settings" button to the top-right of the main screen (`App.js` or `AccountsScreen.js`).
2. Create a settings screen or modal component (e.g., `SettingsScreen.js`).
3. Implement a theme selection UI (radio buttons or picker) for Dark/Light/System in the settings screen.
4. Store the selected theme in app state (e.g., React Context, Redux, or local state).
5. Apply the selected theme across the app, using a theme provider or conditional styles.
6. Ensure the settings screen is accessible from the hamburger button and updates theme live.
7. Settings should open as a modal for simplicity.
8. Theme preference should be stored in persistent storage (e.g., AsyncStorage) to persist across app restarts.