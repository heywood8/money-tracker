module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@sentry/react-native|@sentry/core|@sentry/types|@sentry/utils|drizzle-orm|drizzle-kit|decimal|invariant)|@unimodules|unimodules|sentry-expo|native-base|react-native-svg)/',
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
};
