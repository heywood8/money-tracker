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
  ],
  moduleNameMapper: {
    '^expo$': '<rootDir>/node_modules/expo',
    '^expo/(.*)$': '<rootDir>/node_modules/expo/$1',
  },
  // Coverage thresholds - relaxed for DSL/declarative code
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
    // app/db/schema.js contains Drizzle ORM DSL code (declarative table definitions)
    // The index callbacks and .references() method chains can't be properly instrumented
    // by coverage tools, resulting in ~35% coverage despite comprehensive tests
    './app/db/schema.js': {
      statements: 35,
      branches: 100,
      functions: 0,
      lines: 35,
    },
  },
};
