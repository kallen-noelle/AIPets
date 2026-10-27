<script setup lang="ts">
import type { AnimationCommand, AnimationEvent, NormalizedClip } from '@proj-airi/character-animation'

import type { LoadedAnimationPack } from '../../adapters/animation/zip-loader'

import { AnimationController } from '@proj-airi/character-animation'
import { Screen } from '@proj-airi/ui'
import { computed, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue'

import { loadAnimationPack } from '../../adapters/animation/zip-loader'
import { useAnimationSettingsStore } from '../../stores/animation-settings'

const props = withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string
  /** Scene painted behind the animation. */
  backgroundUrl?: string | null
  paused?: boolean
  nowSpeaking?: boolean
}>(), {
  backgroundUrl: null,
  paused: false,
  nowSpeaking: false,
})

const emit = defineEmits<{
  error: [error: Error]
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const videoARef = useTemplateRef<HTMLVideoElement>('videoA')
const videoBRef = useTemplateRef<HTMLVideoElement>('videoB')
const containerRef = useTemplateRef<HTMLElement>('container')

const loaded = shallowRef<LoadedAnimationPack>()
const controller = shallowRef<AnimationController>()
const activeSlot = ref<'a' | 'b'>('a')
const transitionMs = ref(180)
let activeSlotKey: 'a' | 'b' = 'a'
let fadeTimer: ReturnType<typeof setTimeout> | undefined

const animationSettings = useAnimationSettingsStore()

const videos = computed(() => ({
  a: videoARef.value,
  b: videoBRef.value,
}))

const containerStyle = computed(() => ({
  backgroundImage: props.backgroundUrl ? `url(${props.backgroundUrl})` : undefined,
  transform: `scaleX(${animationSettings.mirror ? -1 : 1}) scale(${animationSettings.scale})`,
}))

function videoStyle(slot: 'a' | 'b') {
  return {
    opacity: activeSlot.value === slot ? 1 : 0,
    transitionDuration: `${transitionMs.value}ms`,
  }
}

function pauseAll() {
  for (const video of Object.values(videos.value))
    video?.pause()
}

function pauseInactive(slot: 'a' | 'b') {
  clearTimeout(fadeTimer)
  fadeTimer = setTimeout(() => {
    videos.value[slot]?.pause()
  }, transitionMs.value + 50)
}

function applyCommands(commands: AnimationCommand[]) {
  for (const command of commands) {
    if (command.type === 'pause') {
      pauseAll()
      continue
    }
    if (command.type === 'resume') {
      void videos.value[activeSlotKey]?.play().catch(() => {})
      continue
    }
    void playClip(command.clip, command.fadeMs)
  }
}

async function playClip(clip: NormalizedClip, fadeMs: number) {
  const nextKey: 'a' | 'b' = activeSlotKey === 'a' ? 'b' : 'a'
  const next = videos.value[nextKey]
  const source = loaded.value?.sources[clip.src]
  if (!next || !source)
    return

  transitionMs.value = animationSettings.fadeMs ?? fadeMs
  next.dataset.clipId = clip.id
  if (next.src !== source)
    next.src = source
  try {
    next.currentTime = 0
  }
  catch {
    // A video without loaded metadata rejects a seek. Playback starts from the first frame anyway.
  }
  await next.play().catch(() => {})

  const previousKey = activeSlotKey
  activeSlotKey = nextKey
  activeSlot.value = nextKey
  pauseInactive(previousKey)
}

function dispatch(event: AnimationEvent) {
  const commands = controller.value?.dispatch(event)
  if (commands)
    applyCommands(commands)
}

function handleEnded(event: Event) {
  const video = event.target as HTMLVideoElement
  // A slot that a later clip replaced can still fire `ended` during the fade.
  if (video !== videos.value[activeSlotKey])
    return

  const clipId = video.dataset.clipId
  if (!clipId)
    return
  const commands = controller.value?.clipEnded(clipId)
  if (commands?.length)
    applyCommands(commands)
}

function playEmotion(emotion: string, intensity = 1) {
  dispatch({ type: 'emotion', emotion, intensity })
}

function playAction(name: string, durationSeconds?: number) {
  const durationMs = durationSeconds !== undefined ? Math.round(durationSeconds * 1000) : undefined
  dispatch({ type: 'action', name, durationMs })
}

function playExpression(name: string) {
  dispatch({ type: 'expression', name })
}

function stopAction() {
  dispatch({ type: 'longActionStop' })
}

function triggerClick(area?: 'head' | 'body') {
  dispatch({ type: 'click', area })
}

/** A press that moves less than this stays a click instead of a window drag. */
const clickThresholdPx = 4
let pointerStart: { x: number, y: number } | null = null

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0)
    return
  pointerStart = { x: event.clientX, y: event.clientY }
}

function handlePointerUp(event: PointerEvent) {
  if (!animationSettings.clickEnabled)
    return

  const start = pointerStart
  pointerStart = null
  if (!start || event.button !== 0)
    return

  // A drag belongs to the host window, so it must not also count as a poke.
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > clickThresholdPx)
    return

  const target = event.currentTarget as HTMLElement | null
  if (!target)
    return

  const rect = target.getBoundingClientRect()
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 1
  triggerClick(ratio < 0.4 ? 'head' : 'body')
}

function setSpeaking(value: boolean) {
  dispatch({ type: 'speaking', value })
}

function setThinking(value: boolean) {
  dispatch({ type: 'thinking', value })
}

let samplingCanvas: HTMLCanvasElement | undefined
let samplingDrawnAt = 0

/**
 * Draws the active video frame into one reused canvas.
 *
 * The desktop window samples this canvas on every pointer move, so allocating a
 * canvas per sample would allocate on every mouse move. `force` redraws for a
 * capture, where a frame up to one screen refresh old would end up in the file.
 */
function drawActiveFrame(force = false): HTMLCanvasElement | undefined {
  const video = videos.value[activeSlotKey]
  if (!video || !video.videoWidth || !video.videoHeight)
    return undefined

  if (!samplingCanvas || samplingCanvas.width !== video.videoWidth || samplingCanvas.height !== video.videoHeight) {
    samplingCanvas = document.createElement('canvas')
    samplingCanvas.width = video.videoWidth
    samplingCanvas.height = video.videoHeight
    force = true
  }

  const now = performance.now()
  if (!force && now - samplingDrawnAt < 16)
    return samplingCanvas

  const context = samplingCanvas.getContext('2d')
  if (!context)
    return undefined

  context.drawImage(video, 0, 0, samplingCanvas.width, samplingCanvas.height)
  samplingDrawnAt = now
  return samplingCanvas
}

/**
 * The element that covers the character.
 *
 * The desktop window tests `document.elementFromPoint` to tell the character
 * apart from the interface above it. A video animation exposes no canvas in the
 * DOM, so the host needs this element instead.
 */
function surfaceElement() {
  return containerRef.value ?? null
}

async function captureFrame(): Promise<Blob | null> {
  const canvas = drawActiveFrame(true)
  if (!canvas)
    return null

  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
}

function disposePack() {
  clearTimeout(fadeTimer)
  pauseAll()
  controller.value?.dispose()
  for (const video of Object.values(videos.value)) {
    if (video)
      video.removeAttribute('src')
  }
  loaded.value?.dispose()
  loaded.value = undefined
  controller.value = undefined
  samplingCanvas = undefined
  samplingDrawnAt = 0
}

async function loadModel(src?: string) {
  disposePack()
  componentState.value = src ? 'loading' : 'pending'
  if (!src)
    return

  try {
    const blob = await fetch(src).then(response => response.blob())
    loaded.value = await loadAnimationPack(new File([blob], 'animation.zip'))

    const pack = loaded.value
    if (!pack)
      return

    transitionMs.value = pack.pack.manifest.transition?.fadeMs ?? 180
    controller.value = new AnimationController(pack.pack)
    dispatch({ type: 'idle' })
    if (props.paused)
      dispatch({ type: 'paused', value: true })
    if (props.nowSpeaking)
      dispatch({ type: 'speaking', value: true })
    componentState.value = 'mounted'
  }
  catch (error) {
    disposePack()
    const reason = error instanceof Error ? error : new Error('Failed to load the animation pack')
    emit('error', reason)
    componentState.value = 'pending'
  }
}

watch(() => props.modelSrc, loadModel, { immediate: true })
watch(() => props.paused, value => dispatch({ type: 'paused', value }))
watch(() => props.nowSpeaking, value => dispatch({ type: 'speaking', value }))

onUnmounted(disposePack)

defineExpose({
  canvasElement: drawActiveFrame,
  surfaceElement,
  captureFrame,
  playEmotion,
  playAction,
  playExpression,
  setExpression: playExpression,
  stopAction,
  triggerClick,
  setSpeaking,
  setThinking,
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <div
      ref="container"
      class="relative overflow-hidden"
      :style="[{ width: `${width}px`, height: `${height}px` }, containerStyle]"
      :class="[
        'bg-cover bg-center',
      ]"
      @pointerdown="handlePointerDown"
      @pointerup="handlePointerUp"
    >
      <video
        ref="videoA"
        class="absolute inset-0 h-full w-full object-contain object-bottom transition-opacity ease-linear"
        :style="videoStyle('a')"
        muted
        playsinline
        preload="auto"
        @ended="handleEnded"
      />
      <video
        ref="videoB"
        class="absolute inset-0 h-full w-full object-contain object-bottom transition-opacity ease-linear"
        :style="videoStyle('b')"
        muted
        playsinline
        preload="auto"
        @ended="handleEnded"
      />
    </div>
  </Screen>
</template>
