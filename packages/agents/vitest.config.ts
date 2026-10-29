import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-aipets/agents',
    include: ['src/**/*.test.ts'],
  },
})
