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

const semanticTagDefaults = {
  shy: { valence: 0.45, arousal: 0.55 },
  happy: { valence: 0.7, arousal: 0.65 },
  excited: { valence: 0.75, arousal: 0.8 },
  angry: { valence: -0.4, arousal: 0.7 },
  sad: { valence: -0.5, arousal: 0.3 },
  sleepy: { valence: 0.1, arousal: 0.15 },
  surprised: { valence: 0.2, arousal: 0.75 },
  thinking: { valence: 0.2, arousal: 0.4 },
  work: { valence: 0.3, arousal: 0.5 },
  food: { valence: 0.35, arousal: 0.5 },
  perform: { valence: 0.6, arousal: 0.65 },
  magic: { valence: 0.65, arousal: 0.7 },
  polite: { valence: 0.5, arousal: 0.4 },
  vanity: { valence: 0.5, arousal: 0.5 },
  play: { valence: 0.6, arousal: 0.65 },
  animal: { valence: 0.5, arousal: 0.5 },
  seasonal: { valence: 0.6, arousal: 0.6 },
  look: { valence: 0.3, arousal: 0.4 },
  drag: { valence: 0.2, arousal: 0.6 },
  money: { valence: 0.1, arousal: 0.5 },
  click: { valence: 0.3, arousal: 0.5 },
  ambient: { valence: 0.2, arousal: 0.4 },
}

const semanticKeywordRules = [
  { tags: ['shy', 'happy'], keywords: ['害羞', '脸红', '羞涩'] },
  { tags: ['happy', 'excited'], keywords: ['开心', '雀跃', '庆祝', '欢呼', '元气', '咯咯笑'] },
  { tags: ['angry'], keywords: ['生气', '傲娇', '气急败坏', '凶'] },
  { tags: ['sad'], keywords: ['难过', '垂头', '叹气', '哭', '失落'] },
  { tags: ['sleepy'], keywords: ['哈欠', '困', '小憩', '睡', '打瞌睡'] },
  { tags: ['surprised'], keywords: ['吓', '惊', '突然'] },
  { tags: ['thinking', 'work'], keywords: ['思考', '碎碎念', '写代码', '记录', '大脑'] },
  { tags: ['work'], keywords: ['工作', '忙碌', '归档', '清点', '整理', '擦桌'] },
  { tags: ['food'], keywords: ['吃', '零食', '火锅', '饭', '月饼', '粽子', '冰淇淋'] },
  { tags: ['perform'], keywords: ['舞', '演奏', '小提琴', '笛', '唱', '摇摆'] },
  { tags: ['magic'], keywords: ['魔法', '魔术', '鸽子', '生花', '扑克'] },
  { tags: ['polite'], keywords: ['礼仪', '屈膝', '鞠躬'] },
  { tags: ['vanity'], keywords: ['镜子', '换装', '试色'] },
  { tags: ['play'], keywords: ['玩', '游戏', '魔方', '玩具', '陀螺', '风筝', '秋千', '抛接', '毽子'] },
  { tags: ['animal'], keywords: ['猫', '动物', '鲸鱼', '蝴蝶', '蜜蜂'] },
  { tags: ['seasonal'], keywords: ['中秋', '粽子', '烟花', '圣诞', '红包', '雪人', '汤圆', '饺子', '福字', '南瓜'] },
  { tags: ['look'], keywords: ['东张西望', '张望', '观察'] },
  { tags: ['drag'], keywords: ['拖拽'] },
  { tags: ['money'], keywords: ['余额', '钱袋'] },
]

function inferTags(name, role) {
  const tags = []
  if (role === 'loop')
    tags.push('loop')
  if (name.startsWith('点击回应'))
    tags.push('click')

  for (const rule of semanticKeywordRules) {
    if (rule.keywords.some(keyword => name.includes(keyword)))
      tags.push(...rule.tags)
  }

  const semanticTags = unique(tags).filter(tag => semanticTagDefaults[tag])
  if (!semanticTags.length)
    semanticTags.push('ambient')

  return unique([...tags, ...semanticTags])
}

function inferSemantics(name, role) {
  const tags = inferTags(name, role)
  const primaryTag = tags.find(tag => semanticTagDefaults[tag]) ?? 'ambient'
  const defaults = semanticTagDefaults[primaryTag]

  return {
    id: clipPath(name),
    name,
    description: name,
    tags,
    valence: defaults.valence,
    arousal: defaults.arousal,
    role,
    source: 'inferred',
  }
}

function readSemantics(config, id) {
  const input = config.semantics
  if (input === undefined)
    return {}

  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(`${id}: semantics must be an object`)

  const semantics = {}
  for (const [name, entry] of Object.entries(input)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`${id}: semantics.${name} must be an object`)

    if (entry.description !== undefined && (typeof entry.description !== 'string' || !entry.description))
      throw new Error(`${id}: semantics.${name}.description must be a non-empty string`)
    if (entry.tags !== undefined) {
      if (!Array.isArray(entry.tags) || entry.tags.some(tag => typeof tag !== 'string' || !tag))
        throw new Error(`${id}: semantics.${name}.tags must be a string array`)
    }
    if (entry.valence !== undefined && (typeof entry.valence !== 'number' || entry.valence < -1 || entry.valence > 1))
      throw new Error(`${id}: semantics.${name}.valence must be between -1 and 1`)
    if (entry.arousal !== undefined && (typeof entry.arousal !== 'number' || entry.arousal < 0 || entry.arousal > 1))
      throw new Error(`${id}: semantics.${name}.arousal must be between 0 and 1`)
    if (entry.role !== undefined && !['loop', 'oneShot', 'transition'].includes(entry.role))
      throw new Error(`${id}: semantics.${name}.role is invalid`)

    semantics[name] = entry
  }

  return semantics
}

function buildCatalog(id, clipNames, roleByName, config, generatedAt) {
  const overrides = readSemantics(config, id)
  const unknown = Object.keys(overrides).filter(name => !clipNames.includes(name))
  if (unknown.length)
    throw new Error(`${id}: semantics references unknown clips: ${unknown.join(', ')}`)

  const clips = clipNames.map((name) => {
    const inferred = inferSemantics(name, roleByName[name] ?? 'oneShot')
    const override = overrides[name]
    if (!override)
      return inferred

    const tags = override.tags ?? inferred.tags
    const primaryTag = tags.find(tag => semanticTagDefaults[tag]) ?? 'ambient'
    const defaults = semanticTagDefaults[primaryTag]

    return {
      ...inferred,
      description: override.description ?? inferred.description,
      tags,
      valence: override.valence ?? defaults.valence,
      arousal: override.arousal ?? defaults.arousal,
      role: override.role ?? inferred.role,
      source: 'manual',
    }
  })

  return {
    catalogVersion: 1,
    packId: id,
    generatedAt,
    clips,
  }
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

  const loopNames = new Set([
    ...idle,
    ...talk,
    ...(animations.turn ?? []),
  ])
  const roleByName = Object.fromEntries(
    actionNames.map(action => [action, loopNames.has(action) ? 'loop' : 'oneShot']),
  )

  const catalog = buildCatalog(
    id,
    actionNames,
    roleByName,
    config,
    statSync(join(directory, 'config.json')).mtime.toISOString(),
  )

  const emotionGroups = {}
  for (const clip of catalog.clips) {
    for (const emotion of ['happy', 'shy', 'angry', 'sad', 'sleepy']) {
      if (!clip.tags.includes(emotion))
        continue
      emotionGroups[emotion] ??= []
      emotionGroups[emotion].push(clip.name)
    }
  }
  const emotions = Object.fromEntries(
    Object.entries(emotionGroups).map(([emotion, names]) => [emotion, clipList(names, false)]),
  )

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
      ...(Object.keys(emotions).length ? { emotion: emotions } : {}),
      actions,
    },
  }

  return { manifest, actionCount: actionNames.length, catalog }
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
  const { manifest, actionCount, catalog } = buildManifest(
    id,
    directory,
    config,
    definition.appearance,
    preview,
    definition.name,
  )

  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(directory, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)

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

  stdout.write(`${id}: ${actionCount} actions and ${catalog.clips.length} catalog clips from assets/${id}/character.json\n`)

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
