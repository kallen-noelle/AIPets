import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'airi-plugin-game-chess': './src/extension/index.ts',
  },
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  dts: false,
  deps: {
    alwaysBundle: [/.*/],
  },
})
