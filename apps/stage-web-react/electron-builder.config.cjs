/**
 * electron-builder configuration for the aipets desktop app.
 *
 * The renderer is bundled by Vite into `dist`, and the main process is plain
 * CommonJS in `electron/`. The packaged app needs no `node_modules`, so only
 * those two folders, the icons, and the manifest go into the archive.
 */

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'ai.aipets.app',
  productName: 'aipets',
  copyright: 'aipets',
  directories: {
    // Keep the installer output apart from the Vite `dist` folder.
    output: 'release',
    buildResources: 'resources',
  },
  files: [
    'dist/**',
    'electron/**',
    'resources/**',
    'package.json',
    '!node_modules/**',
  ],
  asar: true,
  npmRebuild: false,
  win: {
    executableName: 'aipets',
    icon: 'resources/icon.ico',
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
  },
  nsis: {
    // electron-builder expands these macros. They are not JavaScript template
    // strings, so the linter must not read them as such.
    // eslint-disable-next-line no-template-curly-in-string
    artifactName: '${productName}-${version}-windows-${arch}-setup.${ext}',
    shortcutName: 'aipets',
    uninstallDisplayName: 'aipets',
    createDesktopShortcut: 'always',
    deleteAppDataOnUninstall: true,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    runAfterFinish: true,
  },
}
