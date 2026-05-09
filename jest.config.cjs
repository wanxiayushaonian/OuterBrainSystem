/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/frontend/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/frontend/src/$1',
    '^@core/(.*)$': '<rootDir>/frontend/src/core/$1',
    '^@features/(.*)$': '<rootDir>/frontend/src/features/$1',
    '^@shared/(.*)$': '<rootDir>/frontend/src/shared/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
};
