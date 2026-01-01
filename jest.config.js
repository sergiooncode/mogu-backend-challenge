module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Set test environment to Node.js
  testEnvironment: 'node',

  // Test file patterns - match files in tests/ directory
  testMatch: ['**/tests/**/*.test.ts'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Exclude main entry point from coverage
  ],

  // Coverage thresholds (optional, can be adjusted)
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },

  // Setup files to run after environment is set up
  // Will be used in Phase 2 for database initialization
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Test timeout - 10 seconds to accommodate database operations
  testTimeout: 10000,

  // Run tests sequentially to avoid database race conditions
  maxWorkers: 1,

  // Module paths for clean imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // TypeScript configuration for ts-jest
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
      },
    }],
  },
}
