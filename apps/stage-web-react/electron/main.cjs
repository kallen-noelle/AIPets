/**
 * Minimal Electron main process for stage-web-react.
 *
 * In development, it loads the Vite dev server at PORT 5173.
 * In production (when `app.isPackaged` is true), it loads the built
 * `dist/index.html` file with a hash route so React Router works.
 *
 * To run the Electron shell, install electron as a dev dep in this app
 * first (`pnpm add -D electron@catalog:`). Then:
 *   pnpm -F @proj-airi/stage-web-react dev    (vite dev server)
 *   pnpm -F @proj-airi/stage-web-react electron
 *
 * This shell is intentionally thin — stage-tamagotchi still owns the tray,
 * IPC, fullscreen, plugins, and every other desktop service. That shell
 * will move to the React renderer once this entry is stable.
 */

const path = require('node:path')
const process = require('node:process')

const { app, BrowserWindow } = require('electron')

function createWindow() {
  const window = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 480,
    minHeight: 360,
    title: 'aipetdex',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: '/' })
  }
  else {
    window.loadURL('http://localhost:5173/#/')
    window.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
