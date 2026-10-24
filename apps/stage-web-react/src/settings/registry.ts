export type SettingsEntryStatus = 'ready' | 'planned'

export interface SettingsEntry {
  id: string
  path: string
  titleKey: string
  descriptionKey?: string
  icon: string
  status: SettingsEntryStatus
}

/**
 * Settings navigation for the React app.
 *
 * The Vue app built this list from `route.meta.settingsEntry`. React Router
 * has no file-based metadata, so the list is explicit and typed here.
 */
export const settingsEntries: SettingsEntry[] = [
  {
    id: 'account',
    path: '/settings/account',
    titleKey: 'settings.pages.account.title',
    descriptionKey: 'settings.pages.account.description',
    icon: 'i-solar:user-circle-bold-duotone',
    status: 'ready',
  },
  {
    id: 'card',
    path: '/settings/card',
    titleKey: 'settings.pages.card.title',
    icon: 'i-solar:emoji-funny-square-bold-duotone',
    status: 'ready',
  },
  {
    id: 'memory',
    path: '/settings/memory',
    titleKey: 'settings.pages.memory.title',
    descriptionKey: 'settings.pages.memory.description',
    icon: 'i-solar:notebook-bookmark-bold-duotone',
    status: 'ready',
  },
  {
    id: 'data',
    path: '/settings/data',
    titleKey: 'settings.pages.data.title',
    descriptionKey: 'settings.pages.data.description',
    icon: 'i-solar:database-bold-duotone',
    status: 'ready',
  },
  {
    id: 'models',
    path: '/settings/models',
    titleKey: 'settings.pages.models.title',
    // The shared locale still describes Live2D and VRM, which this app dropped.
    descriptionKey: 'settings.reactShell.modelsDescription',
    icon: 'i-solar:box-bold-duotone',
    status: 'ready',
  },
  {
    id: 'providers',
    path: '/settings/providers',
    titleKey: 'settings.pages.providers.title',
    icon: 'i-solar:cloud-bold-duotone',
    status: 'ready',
  },
  {
    id: 'modules',
    path: '/settings/modules',
    titleKey: 'settings.pages.modules.title',
    icon: 'i-solar:widget-4-bold-duotone',
    status: 'ready',
  },
  {
    id: 'connection',
    path: '/settings/connection',
    titleKey: 'settings.pages.connection.title',
    icon: 'i-solar:server-bold-duotone',
    status: 'ready',
  },
  {
    id: 'scene',
    path: '/settings/scene',
    titleKey: 'settings.pages.scene.title',
    icon: 'i-solar:gallery-wide-bold-duotone',
    status: 'ready',
  },
  {
    id: 'system',
    path: '/settings/system',
    titleKey: 'settings.pages.system.title',
    icon: 'i-solar:settings-bold-duotone',
    status: 'ready',
  },
]
