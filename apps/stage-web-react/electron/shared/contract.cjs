/**
 * The IPC contract of the React desktop host.
 *
 * The main process and the preload script are plain CommonJS without a build
 * step, so this table is the single source of the channel names. The renderer
 * mirror is `src/desktop/bridge.ts`: every bridge method calls one entry here
 * and declares its payload types. Change a name here and that method together.
 */

const CHANNELS = {
  getInfo: 'desktop:get-info',
  setClickThrough: 'desktop:set-click-through',
  setVisible: 'desktop:set-visible',
  visibilityChanged: 'desktop:visibility-changed',

  getPreferences: 'desktop:get-preferences',
  setPreferences: 'desktop:set-preferences',
  preferencesChanged: 'desktop:preferences-changed',

  getPowerState: 'desktop:get-power-state',
  powerEvent: 'desktop:power-event',

  listDisplays: 'desktop:list-displays',
  displaysChanged: 'desktop:displays-changed',

  windowOpen: 'desktop:window-open',
  windowClose: 'desktop:window-close',
  windowList: 'desktop:window-list',
  windowFocus: 'desktop:window-focus',
  windowToggleFullscreen: 'desktop:window-toggle-fullscreen',
  windowAlwaysOnTop: 'desktop:window-always-on-top',
  windowsChanged: 'desktop:windows-changed',

  pluginsList: 'plugins:list',
  pluginsInstall: 'plugins:install',
  pluginsSetEnabled: 'plugins:set-enabled',
  pluginsRemove: 'plugins:remove',
  pluginsOpen: 'plugins:open',
  pluginsClose: 'plugins:close',
}

/** Window kinds the window manager can create or reach. */
const WINDOW_KINDS = ['main', 'settings', 'widget']

const PREFERENCES_DEFAULTS = {
  closeToTray: true,
}

module.exports = { CHANNELS, PREFERENCES_DEFAULTS, WINDOW_KINDS }
