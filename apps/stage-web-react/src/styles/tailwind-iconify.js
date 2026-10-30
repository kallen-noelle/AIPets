import { createRequire } from 'node:module'

import iconify from '@iconify/tailwind4'

const require = createRequire(import.meta.url)
const solarIcons = require.resolve('@iconify-json/solar/icons.json')

/**
 * NOTICE:
 * `@iconify/tailwind4` looks for icon collections in its own module folder.
 * pnpm strict linking keeps `@iconify-json/solar` outside that folder.
 * This wrapper passes an absolute file so the plugin loads the collection.
 * Source: node_modules/@iconify/tailwind4/lib/helpers/loader.js
 * Removal condition: the plugin resolves the app collection on its own.
 */
export default iconify({
  prefix: 'icon',
  scale: 1.2,
  iconSets: [`from-json(solar, ${solarIcons})`],
})
