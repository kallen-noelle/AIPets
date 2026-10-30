export type ModuleCategory = 'essential'

export interface ModuleEntry {
  id: string
  titleKey: string
  descriptionKey: string
  icon: string
  path: string
  category: ModuleCategory
  /**
   * Vue stores flag as JSON, so `useLocalStorage` writes strings such as
   * `"true"` or `"\"openai\""`.
   */
  configuredFlag?: {
    key: string
    isConfigured: (raw: string | null) => boolean
  }
}

function isTruthyJson(raw: string | null): boolean {
  return raw !== null && raw !== '' && raw !== 'false' && raw !== 'null' && raw !== '""'
}

/**
 * Module catalog for the React settings page.
 *
 * The Vue app derived this list inside `useModulesList`, which read twelve
 * Pinia stores. The React app lists the same modules, and reads only the
 * flags that live in plain local storage. Modules without a flag show no
 * status instead of a false "not configured".
 */
export const modules: ModuleEntry[] = [
  {
    id: 'consciousness',
    titleKey: 'settings.pages.modules.consciousness.title',
    descriptionKey: 'settings.pages.modules.consciousness.description',
    icon: 'icon-[solar--ghost-bold-duotone]',
    path: '/settings/modules/consciousness',
    category: 'essential',
  },
  {
    id: 'speech',
    titleKey: 'settings.pages.modules.speech.title',
    descriptionKey: 'settings.pages.modules.speech.description',
    icon: 'icon-[solar--user-speak-rounded-bold-duotone]',
    path: '/settings/modules/speech',
    category: 'essential',
  },
  {
    id: 'hearing',
    titleKey: 'settings.pages.modules.hearing.title',
    descriptionKey: 'settings.pages.modules.hearing.description',
    icon: 'icon-[solar--microphone-3-bold-duotone]',
    path: '/settings/modules/hearing',
    category: 'essential',
    configuredFlag: {
      key: 'settings/hearing/active-provider',
      isConfigured: isTruthyJson,
    },
  },
  {
    id: 'vision',
    titleKey: 'settings.pages.modules.vision.title',
    descriptionKey: 'settings.pages.modules.vision.description',
    icon: 'icon-[solar--eye-closed-bold-duotone]',
    path: '/settings/modules/vision',
    category: 'essential',
    configuredFlag: {
      key: 'settings/vision/active-provider',
      isConfigured: isTruthyJson,
    },
  },
  {
    id: 'stickers',
    titleKey: 'settings.pages.modules.stickers.title',
    descriptionKey: 'settings.pages.modules.stickers.description',
    icon: 'icon-[solar--sticker-smile-circle-bold-duotone]',
    path: '/settings/modules/stickers',
    category: 'essential',
    configuredFlag: {
      key: 'settings/stickers/enabled',
      isConfigured: raw => raw === 'true',
    },
  },
  {
    id: 'web-search',
    titleKey: 'settings.pages.modules.web-search.title',
    descriptionKey: 'settings.pages.modules.web-search.description',
    icon: 'icon-[solar--magnifer-bold-duotone]',
    path: '/settings/modules/web-search',
    category: 'essential',
  },
  {
    id: 'artistry',
    titleKey: 'settings.pages.modules.artistry.title',
    descriptionKey: 'settings.pages.modules.artistry.description',
    icon: 'icon-[solar--palette-bold-duotone]',
    path: '/settings/modules/artistry',
    category: 'essential',
  },
  {
    id: 'memory-short-term',
    titleKey: 'settings.pages.modules.memory-short-term.title',
    descriptionKey: 'settings.pages.modules.memory-short-term.description',
    icon: 'icon-[solar--bookmark-bold-duotone]',
    path: '/settings/modules/memory-short-term',
    category: 'essential',
  },
  {
    id: 'memory-long-term',
    titleKey: 'settings.pages.modules.memory-long-term.title',
    descriptionKey: 'settings.pages.modules.memory-long-term.description',
    icon: 'icon-[solar--book-bookmark-bold-duotone]',
    path: '/settings/modules/memory-long-term',
    category: 'essential',
  },
  {
    id: 'tool-cards',
    titleKey: 'settings.pages.modules.tool-cards.title',
    descriptionKey: 'settings.pages.modules.tool-cards.description',
    icon: 'icon-[solar--widget-5-bold-duotone]',
    path: '/settings/modules/tool-cards',
    category: 'essential',
  },
  {
    id: 'home-assistant',
    titleKey: 'settings.pages.modules.home-assistant.title',
    descriptionKey: 'settings.pages.modules.home-assistant.description',
    icon: 'icon-[solar--home-smile-bold-duotone]',
    path: '/settings/modules/home-assistant',
    category: 'essential',
  },
  {
    id: 'mcp-server',
    titleKey: 'settings.pages.modules.mcp-server.title',
    descriptionKey: 'settings.pages.modules.mcp-server.description',
    icon: 'icon-[solar--server-bold-duotone]',
    path: '/settings/modules/mcp',
    category: 'essential',
  },
  {
    id: 'beat-sync',
    titleKey: 'settings.pages.modules.beat_sync.title',
    descriptionKey: 'settings.pages.modules.beat_sync.description',
    icon: 'icon-[solar--music-notes-bold-duotone]',
    path: '/settings/modules/beat-sync',
    category: 'essential',
  },
]

export const moduleCategories: ModuleCategory[] = ['essential']

export function findModuleByPath(pathname: string): ModuleEntry | undefined {
  return modules.find(entry => pathname === entry.path || pathname.startsWith(`${entry.path}/`))
}
