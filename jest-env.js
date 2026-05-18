// Custom test environment that extends the project-root jest-environment-node (v30)
// instead of the one nested inside react-native (v29), avoiding a jest-mock API
// incompatibility (clearMocksOnScope is only in jest-mock@30).
const { TestEnvironment } = require('jest-environment-node');

module.exports = class ReactNativeEnv extends TestEnvironment {
  customExportConditions = ['require', 'react-native'];
};
