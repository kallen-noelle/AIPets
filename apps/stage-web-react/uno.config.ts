import type { UserConfig } from 'unocss'

import { createRequire } from 'node:module'

import { presetIcons } from 'unocss'

import { sharedUnoConfig } from '../../uno.config'

const require = createRequire(import.meta.url)

/**
 * presetIcons loads `@iconify-json/*` collections from the process working
 * directory. Under pnpm strict linking the shared config cannot see this
 * app's collections, so the app provides explicit loaders.
 */
const iconCollections = Object.fromEntries(
  ['solar', 'simple-icons'].map(name => [
    name,
    () => require(`@iconify-json/${name}/icons.json`),
  ]),
)

const base: UserConfig = sharedUnoConfig()

function isNamedPreset(preset: unknown): preset is { name?: string } {
  return typeof preset === 'object' && preset !== null && !Array.isArray(preset)
}

// UnoCSS keeps only the first preset with a given name, so the shared icons
// preset is replaced instead of appended.
const presets = (base.presets ?? []).filter(
  preset => !isNamedPreset(preset) || preset.name !== '@unocss/preset-icons',
)

export default {
  ...base,
  presets: [
    ...presets,
    presetIcons({
      scale: 1.2,
      collections: iconCollections,
    }),
  ],
} satisfies UserConfig
