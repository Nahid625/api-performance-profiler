module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/*.test.ts'],
  // Resolve workspace packages to source, so tests don't need a build first.
  moduleNameMapper: {
    '^@api-profiler/(.*)$': '<rootDir>/packages/$1/src',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.base.json' }],
  },
};
