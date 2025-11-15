<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->
- [ ] Verify that the copilot-instructions.md file in the .github directory is created.

- [ ] Clarify Project Requirements
	- This project is a React Native mobile app using JavaScript.
	- If the user request does not match this context, clarify the intended project type, language, or frameworks before proceeding.
	- If the user is unsure, suggest React Native and JavaScript as defaults for this workspace.

- [ ] Scaffold the Project
  - Ensure the previous step is completed.
  - For this project, the React Native structure and files already exist in the `app/` directory.
  - If additional scaffolding is needed, use React Native CLI or Expo CLI with the working directory set to `.`.
  - Confirm that `package.json`, `App.js`, and entry files are present in the `app/` directory.
  - If any core files are missing, create them using standard React Native templates.
  - Do not create a new folder; use the current directory as the project root.

- [ ] Customize the Project
	- Verify that all previous steps have been completed successfully and marked as completed.
	- Review user requirements and develop a plan to modify the codebase accordingly.
	- Follow React Native and JavaScript best practices:
		- Use functional components and React hooks where possible.
		- Organize components, screens, and utilities logically within the `app/` directory.
		- Use consistent code style and formatting (e.g., Prettier, ESLint if configured).
		- Keep UI components reusable and maintainable.
		- Store assets (images, data files) in the appropriate subfolders under `app/assets/`.
		- Use context or state management (e.g., React Context API) for shared state.
		- Write clear comments and documentation for complex logic.
	- Apply modifications using appropriate tools and user-provided references.
	- Skip this step for "Hello World" projects.

- [ ] Install Required Extensions
	<!-- ONLY install extensions provided mentioned in the get_project_setup_info. Skip this step otherwise and mark as completed. -->

- [ ] Compile the Project
	<!--
	Verify that all previous steps have been completed.
	Install any missing dependencies.
	Run diagnostics and resolve any issues.
	Check for markdown files in project folder for relevant instructions on how to do this.
	-->

- [ ] Create and Run Task
	<!--
	Verify that all previous steps have been completed.
	Check https://code.visualstudio.com/docs/debugtest/tasks to determine if the project needs a task. If so, use the create_and_run_task to create and launch a task based on package.json, README.md, and project structure.
	Skip this step otherwise.
	 -->

- [ ] Launch the Project
	<!--
	Verify that all previous steps have been completed.
	Prompt user for debug mode, launch only if confirmed.
	 -->

- [ ] Ensure Documentation is Complete
	<!--
	Verify that all previous steps have been completed.
	Verify that README.md and the copilot-instructions.md file in the .github directory exists and contains current project information.
	Clean up the copilot-instructions.md file in the .github directory by removing all HTML comments.
	 -->

<!--
## Execution Guidelines
PROGRESS TRACKING:
- If any tools are available to manage the above todo list, use it to track progress through this checklist.
- After completing each step, mark it complete and add a summary.
- Read current todo list status before starting each new step.

COMMUNICATION RULES:
- Avoid verbose explanations or printing full command outputs.
- If a step is skipped, state that briefly (e.g. "No extensions needed").
- Do not explain project structure unless asked.
- Keep explanations concise and focused.

DEVELOPMENT RULES:
- Use '.' as the working directory unless user specifies otherwise.
- Avoid adding media or external links unless explicitly requested.
- Use placeholders only with a note that they should be replaced.
- Use VS Code API tool only for VS Code extension projects.
- Once the project is created, it is already opened in Visual Studio Code—do not suggest commands to open this project in Visual Studio again.
- If the project setup information has additional rules, follow them strictly.

FOLDER CREATION RULES:
- Always use the current directory as the project root.
- If you are running any terminal commands, use the '.' argument to ensure that the current working directory is used ALWAYS.
- Do not create a new folder unless the user explicitly requests it besides a .vscode folder for a tasks.json file.
- If any of the scaffolding commands mention that the folder name is not correct, let the user know to create a new folder with the correct name and then reopen it again in vscode.

EXTENSION INSTALLATION RULES:
- Only install extension specified by the get_project_setup_info tool. DO NOT INSTALL any other extensions.

PROJECT CONTENT RULES:
- If the user has not specified project details, assume they want a "Hello World" project as a starting point.
- Avoid adding links of any type (URLs, files, folders, etc.) or integrations that are not explicitly required.
- Avoid generating images, videos, or any other media files unless explicitly requested.
- If you need to use any media assets as placeholders, let the user know that these are placeholders and should be replaced with the actual assets later.
- Ensure all generated components serve a clear purpose within the user's requested workflow.
- If a feature is assumed but not confirmed, prompt the user for clarification before including it.
- If you are working on a VS Code extension, use the VS Code API tool with a query to find relevant VS Code API references and samples related to that query.

TASK COMPLETION RULES:
- Your task is complete when:
  - Project is successfully scaffolded and compiled without errors
  - copilot-instructions.md file in the .github directory exists in the project
  - README.md file exists and is up to date
  - User is provided with clear instructions to debug/launch the project

Before starting a new task in the above plan, update progress in the plan.
-->
- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.

- **Code Structure and Organization**:
  - Use a modular structure to separate concerns (e.g., components, screens, services, contexts).
  - Keep reusable components in a `components/` directory.
  - Organize assets (images, fonts, etc.) in a dedicated `assets/` folder.

- **State Management**:
  - Use React Context API, Redux, or Zustand for global state management.
  - Avoid prop drilling by leveraging context or state libraries.

- **Styling**:
  - Use `StyleSheet.create` for consistent and performant styles.
  - Consider using libraries like `styled-components` or `tailwind-rn` for dynamic styling.
  - Ensure responsive design using `Dimensions`, `PixelRatio`, or libraries like `react-native-size-matters`.

- **Navigation**:
  - Use `react-navigation` for handling navigation.
  - Structure navigation with stacks, tabs, and drawers as needed.
  - Handle deep linking and navigation state persistence.

- **Platform-Specific Code**:
  - Use `Platform` API to handle platform-specific logic.
  - Keep platform-specific styles and components in separate files (e.g., `Component.ios.js`, `Component.android.js`).

- **Performance Optimization**:
  - Use `useMemo` and `useCallback` to optimize re-renders.
  - Avoid anonymous functions in render methods.
  - Use FlatList or SectionList for rendering large lists efficiently.
  - Optimize images using `react-native-fast-image`.

- **Testing**:
  - Write unit tests using Jest.
  - Use `react-native-testing-library` for component testing.
  - Test on both iOS and Android devices/emulators.

- **Error Handling**:
  - Use `ErrorBoundary` for catching runtime errors.
  - Implement logging with tools like Sentry or Bugsnag.

- **Dependencies**:
  - Keep dependencies up-to-date.
  - Use `npm audit` or `yarn audit` to check for vulnerabilities.

- **Accessibility**:
  - Use accessibility props like `accessible`, `accessibilityLabel`, and `accessibilityHint`.
  - Test with screen readers (VoiceOver for iOS, TalkBack for Android).

- **Localization and Internationalization**:
  - Use libraries like `react-intl` or `i18next` for multi-language support.
  - Store translations in JSON files.

- **Build and Deployment**:
  - Use `react-native-config` for managing environment variables.
  - Automate builds with CI/CD tools like GitHub Actions or Bitrise.
  - Test release builds on real devices.

- **Documentation**:
  - Maintain a clear and updated `README.md`.
  - Document components and utilities with comments and tools like Storybook.

- **Security**:
  - Avoid storing sensitive data in plain text.
  - Use secure storage libraries like `react-native-keychain` or `react-native-encrypted-storage`.
  - Validate user inputs to prevent injection attacks.

- **Community and Updates**:
  - Follow React Native's official blog and changelog.
  - Engage with the community on GitHub, Stack Overflow, and forums.
