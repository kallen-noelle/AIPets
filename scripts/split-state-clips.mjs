#!/usr/bin/env node
import process, { stderr, stdout } from 'node:process'

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Splits a transparent WebM clip into a start part and an end part.
 *
 * The start part holds the first N seconds. The end part holds the rest.
 * The cut frame is also saved as a PNG so the two parts share a still image.
 * All outputs go to the `state` folder next to the source `animations` folder.
 *
 * The split re-encodes with libvpx-vp9. A stream copy cannot cut between
 * keyframes, so it gives the wrong duration. `-auto-alt-ref 0` keeps the
 * VP9 alpha channel. The PNG keeps the same alpha channel.
 *
 * Usage:
 *   pnpm state:split assets/main/animations/荡秋千.webm
 *   pnpm state:split --char main
 *   pnpm state:split --seconds 3 assets/main/animations/荡秋千.webm
 *
 * Call stack:
 * split-state-clips
 *   -> parseArgs
 *   -> collectInputs
 *   -> resolveTool
 *   -> splitClip
 *   -> encodePart
 *   -> extractCutFrame
 *   -> probeDuration
 *   -> stdout.write
 *
 * Defaults: the cut is at 5 seconds. Existing output files stay unless
 * `--force` is set. The `--char` flag processes every clip of one character.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultSeconds = 5
const videoExtensions = ['.webm']
const encodeOptions = [
  '-c:v',
  'libvpx-vp9',
  '-b:v',
  '0',
  '-crf',
  '30',
  '-auto-alt-ref',
  '0',
  '-pix_fmt',
  'yuva420p',
]

function usage() {
  return [
    'Usage: node scripts/split-state-clips.mjs [options] <clip.webm...>',
    '',
    'Options:',
    `  --char <id>      process every clip in assets/<id>/animations`,
    `  --seconds <n>    cut point in seconds (default ${defaultSeconds})`,
    '  --out <dir>      output folder (default: <character>/state)',
    '  --force          overwrite existing output files',
    '  --help           show this message',
    '',
    'Output: <clip>-start.webm, <clip>-end.webm and <clip>-split.png',
  ].join('\n')
}

function parseArgs(argv) {
  const options = { seconds: defaultSeconds, out: null, character: null, force: false, files: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--force') {
      options.force = true
      continue
    }
    if (arg === '--char' || arg === '--seconds' || arg === '--out') {
      const value = argv[index + 1]
      if (value === undefined)
        throw new Error(`${arg} needs a value`)

      index += 1
      if (arg === '--char')
        options.character = value
      else if (arg === '--out')
        options.out = value
      else
        options.seconds = Number(value)

      if (arg === '--seconds' && (!Number.isFinite(options.seconds) || options.seconds <= 0))
        throw new Error('--seconds must be a positive number')
      continue
    }
    if (arg.startsWith('-'))
      throw new Error(`unknown option ${arg}`)

    options.files.push(arg)
  }

  return options
}

function isVideo(name) {
  return videoExtensions.includes(extname(name).toLowerCase())
}

function listClips(directory) {
  return readdirSync(directory)
    .filter(name => isVideo(name) && statSync(join(directory, name)).isFile())
    .sort()
    .map(name => join(directory, name))
}

function collectInputs(options) {
  const inputs = options.files.map(file => resolve(root, file))

  if (options.character) {
    const directory = join(root, 'assets', options.character, 'animations')
    if (!existsSync(directory))
      throw new Error(`missing folder assets/${options.character}/animations`)

    inputs.push(...listClips(directory))
  }

  if (inputs.length === 0)
    throw new Error(`no input clips\n\n${usage()}`)

  for (const input of inputs) {
    if (!existsSync(input))
      throw new Error(`missing clip ${input}`)
    if (!isVideo(input))
      throw new Error(`${input} is not a webm clip`)
  }

  return [...new Set(inputs)]
}

function findBundledTool(name) {
  const toolsRoot = join(root, 'dsh-pet', '.tools')
  if (!existsSync(toolsRoot))
    return null

  for (const folder of readdirSync(toolsRoot)) {
    if (!folder.startsWith('ffmpeg-'))
      continue

    const candidate = join(toolsRoot, folder, 'bin', `${name}.exe`)
    if (existsSync(candidate))
      return candidate
  }

  return null
}

function resolveTool(name) {
  const envPath = process.env[`${name.toUpperCase()}_PATH`]
  if (envPath && existsSync(envPath))
    return envPath

  const onPath = spawnSync(name, ['-version'], { stdio: 'ignore' })
  if (!onPath.error)
    return name

  const bundled = findBundledTool(name)
  if (bundled)
    return bundled

  throw new Error(`cannot find ${name}. Set ${name.toUpperCase()}_PATH or add it to PATH.`)
}

function run(tool, args) {
  const result = spawnSync(tool, args, { encoding: 'utf8' })
  if (result.error)
    throw result.error
  if (result.status !== 0)
    throw new Error(`${basename(tool)} failed: ${(result.stderr ?? '').trim()}`)

  return result.stdout ?? ''
}

function probeDuration(tool, file) {
  const text = run(tool, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ])
  const value = Number(text.trim())
  if (!Number.isFinite(value))
    throw new Error(`cannot read the duration of ${file}`)

  return value
}

function hasAlpha(tool, file) {
  const text = run(tool, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream_tags=ALPHA_MODE',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ])
  return text.trim() === '1'
}

function encodePart(ffmpeg, args, output) {
  run(ffmpeg, ['-y', '-loglevel', 'error', ...args, ...encodeOptions, output])
}

function extractCutFrame(ffmpeg, input, seconds, output) {
  // `-ss` after `-i` seeks frame by frame, so the PNG is the exact cut frame.
  // `-pix_fmt rgba` keeps the VP9 alpha channel in the PNG.
  run(ffmpeg, [
    '-y',
    '-loglevel',
    'error',
    '-i',
    input,
    '-ss',
    String(seconds),
    '-frames:v',
    '1',
    '-pix_fmt',
    'rgba',
    output,
  ])
}

function outputFolder(input, options) {
  if (options.out)
    return resolve(root, options.out)

  return join(dirname(dirname(input)), 'state')
}

function splitClip({ ffmpeg, ffprobe, input, seconds, folder, force }) {
  const name = basename(input, extname(input))
  const startPath = join(folder, `${name}-start.webm`)
  const endPath = join(folder, `${name}-end.webm`)
  const framePath = join(folder, `${name}-split.png`)

  if (!force && existsSync(startPath) && existsSync(endPath) && existsSync(framePath))
    return { input, skipped: true, startPath, endPath, framePath }

  const duration = probeDuration(ffprobe, input)
  if (!(duration > seconds))
    throw new Error(`${basename(input)} lasts ${duration}s. The cut must be shorter.`)

  encodePart(ffmpeg, ['-i', input, '-t', String(seconds)], startPath)
  encodePart(ffmpeg, ['-ss', String(seconds), '-i', input], endPath)
  extractCutFrame(ffmpeg, input, seconds, framePath)

  const startDuration = probeDuration(ffprobe, startPath)
  const endDuration = probeDuration(ffprobe, endPath)
  const sum = startDuration + endDuration
  if (Math.abs(sum - duration) > 0.2)
    throw new Error(`${basename(input)}: parts add to ${sum}s but the source is ${duration}s`)

  return {
    input,
    skipped: false,
    startPath,
    endPath,
    framePath,
    duration,
    startDuration,
    endDuration,
    alpha: hasAlpha(ffprobe, startPath) && hasAlpha(ffprobe, endPath),
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help)
    return stdout.write(`${usage()}\n`)

  const inputs = collectInputs(options)
  const ffmpeg = resolveTool('ffmpeg')
  const ffprobe = resolveTool('ffprobe')

  for (const input of inputs) {
    const folder = outputFolder(input, options)
    mkdirSync(folder, { recursive: true })

    const result = splitClip({
      ffmpeg,
      ffprobe,
      input,
      seconds: options.seconds,
      folder,
      force: options.force,
    })

    if (result.skipped) {
      stdout.write(`${basename(input)}: skipped, outputs exist (use --force)\n`)
      continue
    }

    const alpha = result.alpha ? 'alpha kept' : 'ALPHA MISSING'
    stdout.write(
      `${basename(input)}: ${result.duration.toFixed(3)}s → `
      + `${basename(result.startPath)} ${result.startDuration.toFixed(3)}s + `
      + `${basename(result.endPath)} ${result.endDuration.toFixed(3)}s + `
      + `${basename(result.framePath)} (${alpha})\n`,
    )
  }
}

function messageOf(error) {
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String(error.message)

  return String(error)
}

try {
  main()
}
catch (error) {
  stderr.write(`split-state-clips: ${messageOf(error)}\n`)
  process.exitCode = 1
}
