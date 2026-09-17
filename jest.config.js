module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/*.test.ts'],
  // Tests read workspace packages from source, so they never depend on a prior build.
  moduleNameMapper: {
    '^@api-profiler/(.*)$': '<rootDir>/packages/$1/src',
    '^api-profiler$': '<rootDir>/packages/cli/src',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
