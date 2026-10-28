import type { Plugin } from 'vite'

import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'

import { defineConfig } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const manifestFileName = 'extension.airi.json'

/**
 * Copies the extension manifest into the packaged plugin root.
 *
 * Use when:
 * - Building the plugin that the Extension Host loads from `dist`
 *
 * Expects:
 * - `dist/ui` already exists, so Vite has created the packaged root
 *
 * Returns:
 * - No value. The manifest is written next to the extension entrypoint.
 */
function copyExtensionManifestPlugin(): Plugin {
  return {
    name: 'airi-plugin-game-chess:copy-manifest',
    apply: 'build',
    closeBundle() {
      copyFileSync(resolve(rootDir, manifestFileName), resolve(rootDir, 'dist', manifestFileName))
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), copyExtensionManifestPlugin()],
  build: {
    outDir: 'dist/ui',
    emptyOutDir: true,
    target: 'es2022',
  },
})
