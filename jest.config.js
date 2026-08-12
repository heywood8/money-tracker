module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|drizzle-orm|drizzle-kit|decimal|invariant)|@unimodules|unimodules|native-base|react-native-svg)/',
  ],
  coverageReporters: [
    'json-summary',
    'text',
    'lcov',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/',
  ],
  moduleNameMapper: {
    '^expo$': '<rootDir>/node_modules/expo',
    '^expo/(.*)$': '<rootDir>/node_modules/expo/$1',
  },
  // Coverage thresholds - ratcheted to ~1pp below the measured suite coverage
  // (statements 85.96 / branches 76.17 / functions 81.99 / lines 87.78)
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 75,
      functions: 81,
      lines: 87,
    },
    // app/db/schema.js contains Drizzle ORM DSL code (declarative table definitions)
    // The index callbacks and .references() method chains can't be properly instrumented
    // by coverage tools, so it stays well below the global bar
    './app/db/schema.js': {
      statements: 55,
      branches: 100,
      functions: 36,
      lines: 55,
    },
  },
};
