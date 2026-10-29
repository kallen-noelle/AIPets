import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'aipets-plugin-game-chess': './src/extension/index.ts',
  },
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  dts: false,
  deps: {
    alwaysBundle: [/.*/],
  },
})
