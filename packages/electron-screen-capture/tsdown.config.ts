import type { UserConfig } from 'tsdown'

import { defineConfig } from 'tsdown'

const sharedConfig: UserConfig = {
  format: 'esm',
  external: [
    'electron',
  ],
  exports: true,
}

export default defineConfig([
  {
    ...sharedConfig,
    platform: 'node',
    entry: {
      main: 'src/main/index.ts',
    },
    inlineOnly: false,
  },
  {
    ...sharedConfig,
    platform: 'neutral',
    entry: {
      index: 'src/index.ts',
    },
    inlineOnly: false,
  },
  {
    ...sharedConfig,
    unbundle: true,
    platform: 'browser',
    entry: {
      renderer: 'src/renderer.ts',
    },
    inlineOnly: false,
  },
])
