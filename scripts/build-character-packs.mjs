#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Builds animation packs and site data from per-character configuration.
 *
 * Each `assets/<id>/` folder provides:
 * - `character.json` for display metadata, appearance, and showcase clips.
 * - `config.json` for the dsh-pet animation pools.
 * - `人设.json` for the persona prompt.
 *
 * Outputs:
 * - `assets/<id>/manifest.json` for the app.
 * - `assets/characters.json` for the app index.
 * - `EdgeOne/public/characters/*.webm` for the site.
 * - `EdgeOne/data/characters.json` for the site components.
 *
 * Run `pnpm characters:build` after editing a character folder.
 *
 * Call stack:
 * build-character-packs
 *   -> readCharacterConfig
 *   -> readCharacter
 *   -> buildManifest
 *   -> copyShowcase
 *   -> writeIndexes
 *   -> stdout.write
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetsRoot = join(root, 'assets')
const siteRoot = join(root, 'EdgeOne')
const siteClipsDir = join(siteRoot, 'public', 'characters')
const siteDataPath = join(siteRoot, 'data', 'characters.json')
const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp']
const defaultCanvas = { width: 640, height: 360 }
const defaultAppearance = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  fadeMs: 180,
  mirror: false,
  clickEnabled: true,
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function clipPath(name) {
  return `animations/${name}.webm`
}

function clipEntry(name, loop) {
  return { src: clipPath(name), weight: 1, loop }
}

function clipList(names, loop) {
  return unique(names).map(name => clipEntry(name, loop))
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function numberOr(value, fallback, field, id) {
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (value === undefined)
    return fallback
  throw new Error(`${id}: ${field} must be a finite number`)
}

function booleanOr(value, fallback, field, id) {
  if (typeof value === 'boolean')
    return value
  if (value === undefined)
    return fallback
  throw new Error(`${id}: ${field} must be a boolean`)
}

function stringOr(value, field, id, fallback) {
  if (typeof value === 'string' && value)
    return value
  if (value === undefined && fallback)
    return fallback
  throw new Error(`${id}: ${field} is required`)
}

function resolveAppearance(id, input) {
  const appearance = input ?? {}
  const scale = numberOr(appearance.scale, defaultAppearance.scale, 'appearance.scale', id)
  if (scale <= 0)
    throw new Error(`${id}: appearance.scale must be greater than 0`)

  return {
    scale,
    offsetX: numberOr(appearance.offsetX, defaultAppearance.offsetX, 'appearance.offsetX', id),
    offsetY: numberOr(appearance.offsetY, defaultAppearance.offsetY, 'appearance.offsetY', id),
    fadeMs: Math.max(0, numberOr(appearance.fadeMs, defaultAppearance.fadeMs, 'appearance.fadeMs', id)),
    mirror: booleanOr(appearance.mirror, defaultAppearance.mirror, 'appearance.mirror', id),
    clickEnabled: booleanOr(appearance.clickEnabled, defaultAppearance.clickEnabled, 'appearance.clickEnabled', id),
  }
}

function findPreview(directory) {
  return readdirSync(directory).find((name) => {
    const lower = name.toLowerCase()
    return imageExtensions.some(extension => lower.endsWith(extension)) && statSync(join(directory, name)).isFile()
  })
}

function readCharacterConfig(directory) {
  const id = basename(directory)
  const configPath = join(directory, 'character.json')
  if (!existsSync(configPath))
    return null

  const config = readJson(configPath)
  if (config.id !== id)
    throw new Error(`${id}: character.json id must match its folder name`)

  return {
    id,
    name: stringOr(config.name, 'name', id),
    roman: typeof config.roman === 'string' ? config.roman : '',
    role: stringOr(config.role, 'role', id),
    description: stringOr(config.description, 'description', id),
    accent: stringOr(config.accent, 'accent', id),
    order: numberOr(config.order, 0, 'order', id),
    appearance: resolveAppearance(id, config.appearance),
    showcase: config.showcase ?? {},
  }
}

function buildManifest(id, directory, config, appearance, preview, name) {
  const animations = config.animations ?? {}
  const events = animations.events ?? {}
  const moves = animations.moves ?? {}
  const categories = animations.categories ?? []

  const idle = animations.idle ?? []
  const talk = events.whisper ?? []
  const thinking = animations.turn ?? []
  const click = animations.clicks ?? []
  const eventNames = Object.values(events).flat(Infinity).filter(value => typeof value === 'string')
  const actionNames = unique([
    ...idle,
    ...(animations.turn ?? []),
    ...(animations.drag ?? []),
    ...click,
    ...(moves.actions ?? []).map(action => action.name),
    ...categories.flatMap(category => category.actions ?? []),
    ...talk,
    ...eventNames,
  ])

  if (!idle.length)
    throw new Error(`${id}: config.animations.idle is empty`)

  const missing = actionNames.filter(action => !existsSync(join(directory, clipPath(action))))
  if (missing.length)
    throw new Error(`${id}: missing clips: ${missing.join(', ')}`)

  const actions = {}
  for (const action of actionNames)
    actions[action] = clipEntry(action, false)

  const happy = unique([
    ...click,
    ...categories.flatMap(category => category.actions ?? []),
  ])

  const manifest = {
    manifestVersion: 1,
    id,
    name,
    ...(preview ? { preview } : {}),
    canvas: defaultCanvas,
    transition: { fadeMs: appearance.fadeMs },
    animations: {
      idle: clipList(idle, true),
      ...(talk.length ? { talk: clipList(talk, true) } : {}),
      ...(thinking.length ? { thinking: clipList(thinking, true) } : {}),
      ...(click.length ? { click: clipList(click, false) } : {}),
      ...(happy.length ? { emotion: { happy: clipList(happy, false) } } : {}),
      actions,
    },
  }

  return { manifest, actionCount: actionNames.length }
}

function copyShowcase(id, directory, showcase) {
  if (typeof showcase.idle !== 'string' || !showcase.idle)
    throw new Error(`${id}: showcase.idle is required`)

  const idleSource = join(directory, clipPath(showcase.idle))
  if (!existsSync(idleSource))
    throw new Error(`${id}: missing showcase idle clip ${showcase.idle}`)

  mkdirSync(siteClipsDir, { recursive: true })
  copyFileSync(idleSource, join(siteClipsDir, `${id}-idle.webm`))

  if (!showcase.action)
    return { idle: `/characters/${id}-idle.webm`, action: null, actionLabel: null }

  if (typeof showcase.actionLabel !== 'string' || !showcase.actionLabel)
    throw new Error(`${id}: showcase.actionLabel is required when showcase.action is set`)

  const actionSource = join(directory, clipPath(showcase.action))
  if (!existsSync(actionSource))
    throw new Error(`${id}: missing showcase action clip ${showcase.action}`)

  copyFileSync(actionSource, join(siteClipsDir, `${id}-action.webm`))

  return {
    idle: `/characters/${id}-idle.webm`,
    action: `/characters/${id}-action.webm`,
    actionLabel: showcase.actionLabel,
  }
}

function cleanGeneratedClips() {
  if (!existsSync(siteClipsDir))
    return

  for (const name of readdirSync(siteClipsDir)) {
    if (name.toLowerCase().endsWith('.webm'))
      unlinkSync(join(siteClipsDir, name))
  }
}

function readCharacter(definition) {
  const { id } = definition
  const directory = join(assetsRoot, id)
  const configPath = join(directory, 'config.json')
  if (!existsSync(configPath))
    throw new Error(`${id}: missing assets/${id}/config.json`)

  const config = readJson(configPath)
  const personaPath = join(directory, '人设.json')
  const persona = existsSync(personaPath) ? readJson(personaPath) : null
  const preview = findPreview(directory)
  const { manifest, actionCount } = buildManifest(
    id,
    directory,
    config,
    definition.appearance,
    preview,
    definition.name,
  )

  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const showcase = copyShowcase(id, directory, definition.showcase)

  const appEntry = {
    id,
    name: definition.name,
    roman: definition.roman,
    role: definition.role,
    description: definition.description,
    accent: definition.accent,
    order: definition.order,
    manifest: `${id}/manifest.json`,
    ...(persona ? { persona: `${id}/人设.json` } : {}),
    ...(preview ? { preview: `${id}/${preview}` } : {}),
    appearance: definition.appearance,
    clipCount: actionCount,
  }

  const siteEntry = {
    id,
    name: definition.name,
    roman: definition.roman,
    role: definition.role,
    description: definition.description,
    accent: definition.accent,
    clips: actionCount,
    idle: showcase.idle,
    action: showcase.action,
    actionLabel: showcase.actionLabel,
  }

  stdout.write(`${id}: ${actionCount} actions from assets/${id}/character.json\n`)

  return { appEntry, siteEntry }
}

const definitions = readdirSync(assetsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => readCharacterConfig(join(assetsRoot, entry.name)))
  .filter(Boolean)
  .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))

if (!definitions.length)
  throw new Error('No assets/<id>/character.json files found')

cleanGeneratedClips()

const characters = definitions.map(readCharacter)

writeFileSync(join(assetsRoot, 'characters.json'), `${JSON.stringify(characters.map(entry => entry.appEntry), null, 2)}\n`)
mkdirSync(dirname(siteDataPath), { recursive: true })
writeFileSync(siteDataPath, `${JSON.stringify(characters.map(entry => entry.siteEntry), null, 2)}\n`)

stdout.write(`wrote ${characters.length} characters to assets/characters.json and EdgeOne/data/characters.json\n`)
