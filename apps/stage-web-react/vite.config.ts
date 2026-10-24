import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      // The package exports TypeScript sources so the React app type-checks
      // against the same module the Vue apps use.
      '@proj-airi/character-animation': fileURLToPath(new URL('../../packages/character-animation/src/index.ts', import.meta.url)),
    },
  },
  server: {
    fs: {
      strict: false,
    },
  },
  worker: {
    format: 'es',
  },
})
