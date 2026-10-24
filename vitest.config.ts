import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    setupFiles: ['./tests/setup.mjs'],
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
})
