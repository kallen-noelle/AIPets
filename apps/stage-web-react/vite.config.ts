import type { Plugin } from 'vite'

import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

import { defineConfig } from 'vite'

/** Animation packs live in the repository `assets/`, outside this app. */
const characterAssetsRoot = fileURLToPath(new URL('../../assets', import.meta.url))

const characterAssetTypes: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

/**
 * Serves repository character assets at `/character-assets`.
 *
 * The dev server streams the folder. A build copies it into `dist` so the
 * packaged app keeps every clip it references.
 */
function characterAssets(): Plugin {
  let outDir = ''

  return {
    name: 'aipetdex-character-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/character-assets', (request, response, next) => {
        const pathname = decodeURIComponent((request.url ?? '/').split('?')[0])
          .replace(/^\/character-assets/, '')
        const file = resolve(characterAssetsRoot, `.${pathname}`)

        if (!file.startsWith(`${characterAssetsRoot}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
          next()
          return
        }

        response.setHeader('Content-Type', characterAssetTypes[extname(file).toLowerCase()] ?? 'application/octet-stream')
        createReadStream(file).pipe(response)
      })
    },
    closeBundle() {
      cpSync(characterAssetsRoot, resolve(outDir, 'character-assets'), { recursive: true })
    },
  }
}

export default defineConfig({
  // Relative asset URLs let the packaged Electron app load `dist/index.html`
  // over `file://`.
  base: './',
  plugins: [
    react(),
    UnoCSS(),
    characterAssets(),
  ],
  resolve: {
    alias: {
      // The package exports TypeScript sources so the React app type-checks
      // against the same module the Vue apps use.
      '@proj-aipets/character-animation': fileURLToPath(new URL('../../packages/character-animation/src/index.ts', import.meta.url)),
      // The provider-inference barrel also re-exports Sherpaw local
      // transcription which pulls a 13.8 MB WASM into web builds. Route
      // imports through a local curated barrel instead.
      '@proj-aipets/provider-inference': fileURLToPath(new URL('./src/providers/curated-provider-inference.ts', import.meta.url)),
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
