/**
 * Plugin host of the stage-web-react desktop shell.
 *
 * A plugin is a local folder with an `extension.airi.json` manifest and an ESM
 * entrypoint. The host installs the folder into the user data directory,
 * enables or disables it, and serves its UI through the `plugin-assets://`
 * scheme.
 *
 * The host implements the public extension authoring contract: `setup(ctx)`
 * receives `ctx.kits` and `ctx.modules`. The gamelet kit is the only kit the
 * shell provides today.
 */

const fsp = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const { BrowserWindow, net, protocol } = require('electron')

const SCHEME = 'plugin-assets'
const MANIFEST_FILE = 'extension.airi.json'
const MANIFEST_KIND = 'manifest.extension.airi.moeru.ai'
const MANIFEST_VERSION = 2
const GAMELET_KIT_ID = 'kit.gamelet'
const MAX_LOG_ENTRIES = 80

/** Returns a message for a thrown value. The main process has no ESM import. */
function errorText(error) {
  if (error instanceof Error)
    return error.message
  return String(error)
}

/** Registers the asset scheme. Call it before `app.whenReady()`. */
function registerPluginScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/**
 * Resolves a relative path inside a folder and rejects a path that leaves it.
 *
 * @returns {string | null} The resolved path, or null when the path leaves the folder.
 */
function resolveInside(root, relative) {
  if (typeof relative !== 'string' || relative === '')
    return null

  const file = path.resolve(root, `.${path.sep}${relative}`)
  if (file !== root && !file.startsWith(`${root}${path.sep}`))
    return null
  return file
}

function createDisposableStore() {
  const items = new Set()

  return {
    add(disposable) {
      const item = typeof disposable === 'function' ? { dispose: disposable } : disposable
      if (!item || typeof item.dispose !== 'function')
        return { dispose() {} }

      items.add(item)
      return {
        dispose() {
          if (items.delete(item))
            item.dispose()
        },
      }
    },
    dispose() {
      for (const item of items)
        item.dispose()
      items.clear()
    },
  }
}

function readManifest(manifestFile) {
  return fsp.readFile(manifestFile, 'utf8').then((raw) => {
    const manifest = JSON.parse(raw)
    const problems = []

    if (!manifest || typeof manifest !== 'object')
      throw new Error('The manifest is not an object.')

    if (manifest.manifestVersion !== MANIFEST_VERSION)
      problems.push(`manifestVersion must be ${MANIFEST_VERSION}.`)

    if (typeof manifest.id !== 'string' || !/^[\w.-]+$/.test(manifest.id))
      problems.push('id must contain only letters, digits, dots, dashes, or underscores.')

    if (typeof manifest.version !== 'string' || manifest.version === '')
      problems.push('version is missing.')

    if (manifest.kind !== MANIFEST_KIND)
      problems.push(`kind must be ${MANIFEST_KIND}.`)

    if (typeof manifest.entrypoints?.electron !== 'string' || manifest.entrypoints.electron === '')
      problems.push('entrypoints.electron is missing.')

    if (problems.length)
      throw new Error(problems.join(' '))

    return manifest
  })
}

/**
 * Finds the folder that holds the manifest. A repository plugin keeps it in
 * `dist/`, so the host accepts either the package root or the built folder.
 */
async function findManifestRoot(sourceDir) {
  const direct = path.join(sourceDir, MANIFEST_FILE)
  try {
    const stat = await fsp.stat(direct)
    if (stat.isFile())
      return sourceDir
  }
  catch {}

  const nested = path.join(sourceDir, 'dist', MANIFEST_FILE)
  try {
    const stat = await fsp.stat(nested)
    if (stat.isFile())
      return path.join(sourceDir, 'dist')
  }
  catch {}

  throw new Error(`No ${MANIFEST_FILE} in this folder or its dist folder.`)
}

class PluginHost {
  constructor({ rootDir, stateFile }) {
    this.rootDir = rootDir
    this.stateFile = stateFile
    this.state = { plugins: {} }
    this.records = new Map()
    this.sessionCounter = 0
  }

  async initialize() {
    await fsp.mkdir(this.rootDir, { recursive: true })
    await this.loadState()
    await this.scanInstalled()

    protocol.handle(SCHEME, request => this.handleAssetRequest(request))

    for (const record of this.records.values()) {
      if (this.isEnabled(record.manifest.id))
        await this.activate(record.manifest.id)
    }
  }

  async loadState() {
    try {
      const raw = await fsp.readFile(this.stateFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.plugins && typeof parsed.plugins === 'object')
        this.state = { plugins: parsed.plugins }
    }
    catch {
      this.state = { plugins: {} }
    }
  }

  async saveState() {
    await fsp.writeFile(this.stateFile, JSON.stringify(this.state, null, 2))
  }

  isEnabled(id) {
    return this.state.plugins[id]?.enabled === true
  }

  async scanInstalled() {
    let entries = []
    try {
      entries = await fsp.readdir(this.rootDir, { withFileTypes: true })
    }
    catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory())
        continue

      const dir = path.join(this.rootDir, entry.name)
      const manifestFile = path.join(dir, MANIFEST_FILE)

      try {
        const manifest = await readManifest(manifestFile)
        this.records.set(manifest.id, {
          dir,
          manifest,
          extension: null,
          bindings: new Map(),
          windows: new Map(),
          moduleSubscriptions: new Map(),
          subscriptions: null,
          logs: [],
          error: null,
        })
      }
      catch (error) {
        this.records.set(entry.name, {
          dir,
          manifest: { id: entry.name, version: '0.0.0', entrypoints: {} },
          extension: null,
          bindings: new Map(),
          windows: new Map(),
          moduleSubscriptions: new Map(),
          subscriptions: null,
          logs: [],
          error: errorText(error),
        })
      }
    }
  }

  list() {
    return [...this.records.values()].map(record => ({
      id: record.manifest.id,
      name: record.manifest.name ?? record.manifest.id,
      version: record.manifest.version ?? '0.0.0',
      description: record.manifest.description ?? '',
      enabled: this.isEnabled(record.manifest.id),
      loaded: record.extension !== null,
      error: record.error,
      bindings: [...record.bindings.values()].map(binding => ({
        moduleId: binding.moduleId,
        title: binding.title,
      })),
      logs: record.logs.slice(-20),
    }))
  }

  log(id, level, message) {
    const record = this.records.get(id)
    if (!record)
      return

    record.logs.push({ at: Date.now(), level, message })
    if (record.logs.length > MAX_LOG_ENTRIES)
      record.logs.splice(0, record.logs.length - MAX_LOG_ENTRIES)
  }

  async install(sourceDir) {
    const root = await findManifestRoot(sourceDir)
    const manifest = await readManifest(path.join(root, MANIFEST_FILE))

    if (this.records.has(manifest.id))
      throw new Error(`The plugin ${manifest.id} is already installed.`)

    const destination = path.join(this.rootDir, manifest.id)
    await fsp.cp(root, destination, { recursive: true })

    this.records.set(manifest.id, {
      dir: destination,
      manifest,
      extension: null,
      bindings: new Map(),
      windows: new Map(),
      moduleSubscriptions: new Map(),
      subscriptions: null,
      logs: [],
      error: null,
    })
    this.state.plugins[manifest.id] = { enabled: false }
    await this.saveState()
    this.log(manifest.id, 'info', 'Installed from a local folder.')
    return this.list()
  }

  async setEnabled(id, enabled) {
    const record = this.records.get(id)
    if (!record)
      throw new Error(`The plugin ${id} is not installed.`)

    if (enabled)
      await this.activate(id)
    else
      this.deactivate(id)

    this.state.plugins[id] = { enabled: Boolean(enabled) && record.extension !== null }
    await this.saveState()
    return this.list()
  }

  async activate(id) {
    const record = this.records.get(id)
    if (!record)
      throw new Error(`The plugin ${id} is not installed.`)
    if (record.extension)
      return

    record.error = null
    const entry = resolveInside(record.dir, record.manifest.entrypoints.electron)
    if (!entry) {
      record.error = 'The entrypoint path leaves the plugin folder.'
      throw new Error(record.error)
    }

    const sessionId = `${id}:${++this.sessionCounter}`
    this.log(id, 'info', `Loading ${path.basename(entry)}.`)

    try {
      const loaded = await import(`${pathToFileURL(entry).href}?session=${this.sessionCounter}`)
      const extension = loaded.default ?? loaded.extension

      if (!extension || typeof extension.setup !== 'function')
        throw new Error('The entrypoint does not export an extension with a setup function.')
      if (extension.id !== id)
        throw new Error(`The entrypoint id ${extension.id} does not match ${id}.`)

      record.subscriptions = createDisposableStore()
      await extension.setup(this.createContext(record, sessionId, record.subscriptions))
      record.extension = extension
      this.log(id, 'info', 'Plugin enabled.')
    }
    catch (error) {
      record.error = errorText(error)
      record.subscriptions?.dispose()
      record.subscriptions = null
      record.bindings.clear()
      this.log(id, 'error', record.error)
      throw error
    }
  }

  deactivate(id) {
    const record = this.records.get(id)
    if (!record)
      return

    record.subscriptions?.dispose()
    record.subscriptions = null

    for (const subscriptions of record.moduleSubscriptions.values())
      subscriptions.dispose()
    record.moduleSubscriptions.clear()

    for (const window of record.windows.values()) {
      if (!window.isDestroyed())
        window.destroy()
    }
    record.windows.clear()
    record.bindings.clear()
    record.extension = null
    this.log(id, 'info', 'Plugin disabled.')
  }

  async remove(id) {
    const record = this.records.get(id)
    if (!record)
      throw new Error(`The plugin ${id} is not installed.`)

    this.deactivate(id)
    this.records.delete(id)
    delete this.state.plugins[id]
    await this.saveState()
    await fsp.rm(record.dir, { recursive: true, force: true })
    return this.list()
  }

  createContext(record, sessionId, subscriptions) {
    return {
      extension: { id: record.manifest.id, sessionId },
      subscriptions,
      kits: this.createKitRegistry(record, sessionId, subscriptions),
      modules: {
        register: async (input) => {
          const moduleId = input?.id
          if (typeof moduleId !== 'string' || moduleId === '')
            throw new Error('A module needs an id.')

          const moduleSubscriptions = createDisposableStore()
          record.moduleSubscriptions.set(moduleId, moduleSubscriptions)

          return {
            id: moduleId,
            kits: this.createKitRegistry(record, sessionId, moduleSubscriptions, moduleId),
            subscriptions: moduleSubscriptions,
            dispose: async () => {
              moduleSubscriptions.dispose()
              record.moduleSubscriptions.delete(moduleId)
            },
          }
        },
      },
    }
  }

  createKitRegistry(record, sessionId, subscriptions, moduleId) {
    const runtime = {
      extensionId: record.manifest.id,
      sessionId,
      moduleId,
      subscriptions,
      bindings: {
        bind: input => this.bindGamelet(record, input),
      },
      gamelets: {
        open: bindingId => this.openBinding(record.manifest.id, bindingId),
        configure() {},
        request() {
          throw new Error('The gamelet request channel is not available in this shell.')
        },
        close: bindingId => this.closeBinding(record.manifest.id, bindingId),
        isOpen: bindingId => this.isBindingOpen(record.manifest.id, bindingId),
      },
    }

    const registry = {
      async use(kit) {
        if (!kit || kit.id !== GAMELET_KIT_ID)
          throw new Error(`The host does not provide the kit ${kit?.id ?? 'unknown'}.`)
        return kit.createClient(runtime)
      },
      async tryUse(kit) {
        try {
          return { ok: true, client: await registry.use(kit) }
        }
        catch (error) {
          return {
            ok: false,
            reason: 'missing-kit',
            error: error instanceof Error ? error : new Error(String(error)),
          }
        }
      },
      watch(kit, callback) {
        let disposed = false
        void registry.use(kit)
          .then(client => !disposed && callback({ available: true, kit, client }))
          .catch(error => !disposed && callback({
            available: false,
            kit,
            reason: 'missing-kit',
            error: error instanceof Error ? error : new Error(String(error)),
          }))

        return {
          dispose() {
            disposed = true
          },
        }
      },
    }

    return registry
  }

  bindGamelet(record, input) {
    const moduleId = input?.moduleId ?? `${record.manifest.id}:gamelet`
    const config = input?.config ?? {}
    const binding = {
      moduleId,
      title: typeof config.title === 'string' && config.title !== '' ? config.title : moduleId,
      widget: config.widget ?? {},
      init: config.config?.init ?? {},
    }

    record.bindings.set(moduleId, binding)
    this.log(record.manifest.id, 'info', `Mounted the gamelet ${binding.title}.`)
    return binding
  }

  resolveWidgetUrl(record, binding) {
    const iframe = binding.widget?.iframe
    if (iframe && typeof iframe.assetPath === 'string' && iframe.assetPath !== '') {
      const relative = iframe.assetPath.split('/').filter(Boolean).map(encodeURIComponent).join('/')
      return `${SCHEME}://${record.manifest.id}/${relative}`
    }

    if (iframe && typeof iframe.src === 'string' && iframe.src !== '')
      return iframe.src

    throw new Error('The gamelet has no iframe source.')
  }

  openBinding(id, moduleId) {
    const record = this.records.get(id)
    const binding = record?.bindings.get(moduleId)
    if (!binding)
      throw new Error(`The gamelet ${moduleId} is not mounted.`)

    const existing = record.windows.get(moduleId)
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return true
    }

    const window = new BrowserWindow({
      width: 960,
      height: 760,
      title: binding.title,
      autoHideMenuBar: true,
      backgroundColor: '#111111',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    window.on('closed', () => record.windows.delete(moduleId))
    record.windows.set(moduleId, window)

    window.loadURL(this.resolveWidgetUrl(record, binding)).catch((error) => {
      this.log(id, 'error', `The gamelet window failed: ${errorText(error)}`)
    })

    return true
  }

  closeBinding(id, moduleId) {
    const record = this.records.get(id)
    const window = record?.windows.get(moduleId)
    if (window && !window.isDestroyed())
      window.destroy()
    record?.windows.delete(moduleId)
    return true
  }

  isBindingOpen(id, moduleId) {
    const record = this.records.get(id)
    const window = record?.windows.get(moduleId)
    return Boolean(window && !window.isDestroyed())
  }

  async handleAssetRequest(request) {
    let url
    try {
      url = new URL(request.url)
    }
    catch {
      return new Response('Bad request', { status: 400 })
    }

    const record = this.records.get(decodeURIComponent(url.hostname))
    if (!record)
      return new Response('Unknown plugin', { status: 404 })

    const file = resolveInside(record.dir, decodeURIComponent(url.pathname).replace(/^\/+/, ''))
    if (!file)
      return new Response('Not found', { status: 404 })

    try {
      const stat = await fsp.stat(file)
      if (!stat.isFile())
        return new Response('Not found', { status: 404 })
    }
    catch {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(file).toString())
  }

  dispose() {
    for (const id of this.records.keys())
      this.deactivate(id)
  }
}

module.exports = { PluginHost, registerPluginScheme }
