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
    id: 'card',
    path: '/settings/card',
    titleKey: 'settings.pages.card.title',
    icon: 'icon-[solar--emoji-funny-square-bold-duotone]',
    status: 'ready',
  },
  {
    id: 'data',
    path: '/settings/data',
    titleKey: 'settings.pages.data.title',
    descriptionKey: 'settings.pages.data.description',
    icon: 'icon-[solar--database-bold-duotone]',
    status: 'ready',
  },
  {
    id: 'models',
    path: '/settings/models',
    titleKey: 'settings.pages.models.title',
    // The shared locale still describes Live2D and VRM, which this app dropped.
    descriptionKey: 'settings.reactShell.modelsDescription',
    icon: 'icon-[solar--box-bold-duotone]',
    status: 'ready',
  },
  {
    id: 'providers',
    path: '/settings/providers',
    titleKey: 'settings.pages.providers.title',
    icon: 'icon-[solar--cloud-bold-duotone]',
    status: 'ready',
  },
  {
    id: 'modules',
    path: '/settings/modules',
    titleKey: 'settings.pages.modules.title',
    icon: 'icon-[solar--widget-4-bold-duotone]',
    status: 'ready',
  },
  {
    id: 'connection',
    path: '/settings/connection',
    titleKey: 'settings.pages.connection.title',
    icon: 'icon-[solar--server-bold-duotone]',
    status: 'ready',
  },
  {
    id: 'desktop',
    path: '/settings/desktop',
    titleKey: 'settings.reactShell.desktopTitle',
    descriptionKey: 'settings.reactShell.desktopDescription',
    icon: 'icon-[solar--monitor-bold-duotone]',
    status: 'ready',
  },
  {
    id: 'plugins',
    path: '/settings/plugins',
    titleKey: 'settings.reactShell.pluginsTitle',
    descriptionKey: 'settings.reactShell.pluginsDescription',
    icon: 'icon-[solar--plug-circle-bold-duotone]',
    status: 'ready',
  },
  {
    id: 'system',
    path: '/settings/system',
    titleKey: 'settings.pages.system.title',
    icon: 'icon-[solar--settings-bold-duotone]',
    status: 'ready',
  },
]
