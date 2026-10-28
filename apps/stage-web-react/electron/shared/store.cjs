/**
 * A small JSON store for main-process state.
 *
 * Every file gets defaults, so a missing or malformed file never breaks the
 * window. Writes are debounced and must not throw, because a read-only profile
 * folder is a valid deployment.
 */

const fs = require('node:fs')
const path = require('node:path')

class JsonStore {
  constructor(file, defaults) {
    this.file = file
    this.defaults = defaults
    this.timer = null
    this.data = this.read()
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return { ...this.defaults }

      return { ...this.defaults, ...parsed }
    }
    catch {
      return { ...this.defaults }
    }
  }

  get() {
    return { ...this.data }
  }

  set(patch) {
    if (patch && typeof patch === 'object')
      this.data = { ...this.data, ...patch }

    this.schedule()
    return this.get()
  }

  schedule() {
    if (this.timer)
      clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 300)
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    }
    catch {
      // A read-only profile folder must not break the window.
    }
  }
}

module.exports = { JsonStore }
