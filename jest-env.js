// Custom Jest environment that polyfills the jest-mock@29 → jest-mock@30 API gap.
//
// jest-runtime@30 calls moduleMocker.clearMocksOnScope() in teardown() and
// resetModules(). That method was added in jest-mock@30; when Bun (or npm in some
// configurations) hoists jest-environment-node@29 (a transitive dep of react-native)
// as the resolved version, the method is absent and every suite fails with:
//   TypeError: this._moduleMocker.clearMocksOnScope is not a function
//
// Polyfilling it in the constructor makes jest@30 runtime work correctly regardless
// of which jest-environment-node / jest-mock version the package manager resolves to.
const { TestEnvironment } = require('jest-environment-node');

module.exports = class ReactNativeEnv extends TestEnvironment {
  customExportConditions = ['require', 'react-native'];

  constructor(config, context) {
    super(config, context);
    if (this.moduleMocker && typeof this.moduleMocker.clearMocksOnScope !== 'function') {
      const mm = this.moduleMocker;
      mm.clearMocksOnScope = (scope) => {
        for (const key of Object.keys(scope)) {
          const value = scope[key];
          if (
            value != null &&
            (typeof value === 'object' || typeof value === 'function') &&
            '_isMockFunction' in value &&
            mm.isMockFunction(value) &&
            typeof value.mockClear === 'function'
          ) {
            value.mockClear();
          }
        }
      };
    }
  }
};
