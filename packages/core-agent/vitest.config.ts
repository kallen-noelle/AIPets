import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-aipets/core-agent',
    include: ['src/**/*.test.ts'],
  },
})
