## Plan: Bottom Tab Menu for Screen Navigation

Add a bottom tab menu to switch between Operations, Accounts, Categories, and Graphs screens using React Navigation. This will provide a native-feeling navigation bar at the bottom of the app for easy screen switching.

### Steps
1. Install `@react-navigation/native`, `@react-navigation/bottom-tabs`, and required peer dependencies.
2. Create or update a navigation setup file (e.g., `app/Navigation.js`) to define a bottom tab navigator with four tabs: Operations, Accounts, Categories, Graphs.
3. Implement or link each screen component for the corresponding tab.
4. Wrap the app's root (in `App.js`) with the navigation container and the tab navigator.
5. Style the tab bar to match the app’s theme using values from `ThemeContext`.

### Further Considerations
1. Confirm if all four screens exist; create placeholders if not.
2. Decide on icons for each tab (optional, for better UX).
3. Ensure navigation state persists and works with deep linking if needed.
