<script setup lang="ts">
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import type { EmotionPayload } from '../../constants/emotions'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom, sleep } from '@moeru/std'
import { BrowserPlayback } from '@proj-airi/audio/browser'
import { normalizeActPayload, Playback } from '@proj-airi/pipelines-audio'
import { createQueue } from '@proj-airi/stream-kit'
import { Callout } from '@proj-airi/ui'
import { useBroadcastChannel, useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'

import StageAvatarModelMissing from './stage-avatar-model-missing.vue'
import StageRenderError from './stage-render-error.vue'
import VideoAnimationScene from './VideoAnimationScene.vue'

import { Emotion } from '../../constants/emotions'
import { getSpeechBusContext, speechOutputGetPlaybackState, speechOutputPlaybackStateChangedEvent } from '../../services/speech/bus'
import { useLlmStreamingControlStore } from '../../stores/ai/chat-llm/streaming-control'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useBackgroundStore } from '../../stores/background'
import { useChatStore } from '../../stores/chat'
import { useChatSessionStore } from '../../stores/chat/session-store'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useSpeechStore } from '../../stores/modules/speech'
import { useSettings } from '../../stores/settings'
import { useSettingsStageModel } from '../../stores/settings/stage-model'
import { useSpeechOutputControlStore } from '../../stores/speech-output-control'
import { useVoiceStore } from '../../stores/voice'

const props = withDefaults(defineProps<{
  cursorPosition?: { x: number, y: number }
  enableOrbitControls?: boolean
  paused?: boolean
}>(), {
  enableOrbitControls: true,
  paused: false,
})

const emit = defineEmits<{
  error: [error: Error]
  /** The stage dropped a render error and starts a new load. */
  reset: []
  /** The active card has no model. The app opens the model settings. */
  selectAvatarModel: []
}>()
const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const animationSceneRef = ref<InstanceType<typeof VideoAnimationScene>>()

const settingsStore = useSettings()
const {
  stageModelRenderer,
  stageModelSelectedUrl,
  stageModelSelected,
} = storeToRefs(settingsStore)

const { nowSpeaking } = storeToRefs(useSpeakingStore())
/** `voicing` of `SpeechOutputPlaybackState` in the speech bus. The voice output below keeps it. */
const speechVoicing = shallowRef(false)
const disposePlaybackStateHandler = defineInvokeHandler(
  getSpeechBusContext(),
  speechOutputGetPlaybackState,
  () => ({ speaking: nowSpeaking.value, voicing: speechVoicing.value }),
)
// Emitted at once too, so a window that kept the state of a reloaded stage
// learns that the new stage voices nothing.
watch([nowSpeaking, speechVoicing], ([speaking, voicing]) => {
  getSpeechBusContext().emit(speechOutputPlaybackStateChangedEvent, { speaking, voicing })
}, { immediate: true })
const { audioContext } = useAudioContext()
const speechOutputControlStore = useSpeechOutputControlStore()
const { speechMuted, speechVolume } = storeToRefs(speechOutputControlStore)

const { onBeforeMessageComposed, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatStore()
const chatHookCleanups: Array<() => void> = []
// WORKAROUND: clear previous handlers on unmount to avoid duplicate calls when this component remounts.
//             We keep per-hook disposers instead of wiping the global chat hooks to play nicely with
//             cross-window broadcast wiring.

const showStage = ref(true)
const stageRenderError = shallowRef<Error>()

function handleStageRenderError(error: Error) {
  stageRenderError.value = error
  emit('error', error)
}

function reportStageRenderError(error: unknown) {
  console.error(error)
  handleStageRenderError(new Error(errorMessageFrom(error) ?? 'Failed to render stage'))
}

// Any reset clears the error the parent mirrors, so the loading surface can return
// while the new load runs. Every path that drops `stageRenderError` reports it here.
function clearStageRenderError() {
  stageRenderError.value = undefined
  emit('reset')
}

async function retryStageRenderer() {
  clearStageRenderError()
  showStage.value = false
  await nextTick()
  showStage.value = true
}

watch([stageModelRenderer, stageModelSelected, stageModelSelectedUrl], () => {
  clearStageRenderError()
})

// Caption + Presentation broadcast channels
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })
const assistantCaption = ref('')

type PresentEvent
  = | { type: 'assistant-reset' }
    | { type: 'assistant-append', text: string }
const { post: postPresent } = useBroadcastChannel<PresentEvent, PresentEvent>({ name: 'airi-chat-present' })

function resetAssistantSpeechSurface(source: string) {
  nowSpeaking.value = false
  assistantCaption.value = ''

  try {
    postCaption({ type: 'caption-assistant', text: '' })
  }
  catch (error) {
    console.warn(`[Stage] Failed to post caption reset for ${source} (channel may be closed)`, { error })
  }

  try {
    postPresent({ type: 'assistant-reset' })
  }
  catch (error) {
    console.warn(`[Stage] Failed to post present reset for ${source} (channel may be closed)`, { error })
  }
}

const { activeCard, selectedAvatarModel, ready: cardsReady } = storeToRefs(useAiriCardStore())
const { stageModelUnavailable } = storeToRefs(useSettingsStageModel())
// Before the card store is ready, no card owns the Stage yet, so an empty Stage is not a missing model.
// `missing`: the card has no model. `unavailable`: this device cannot load the model of the card.
const avatarModelPrompt = computed<'missing' | 'unavailable' | undefined>(() => {
  if (!cardsReady.value || stageModelRenderer.value !== 'disabled' || stageRenderError.value)
    return undefined
  if (!selectedAvatarModel.value)
    return 'missing'
  return stageModelUnavailable.value ? 'unavailable' : undefined
})
const speechStore = useSpeechStore()
const chatSession = useChatSessionStore()
const backgroundStore = useBackgroundStore()
const { activeBackgroundUrl } = storeToRefs(backgroundStore)

const emotionsQueue = createQueue<EmotionPayload>({
  handlers: [
    async (ctx) => {
      animationSceneRef.value?.playEmotion(ctx.data.name, ctx.data.intensity)
    },
  ],
})

const streamingControl = useLlmStreamingControlStore()

function toStageEmotionPayload(payload: { name: string, intensity: number }): EmotionPayload | undefined {
  switch (payload.name) {
    case 'happy':
      return { name: Emotion.Happy, intensity: payload.intensity }
    case 'sad':
      return { name: Emotion.Sad, intensity: payload.intensity }
    case 'angry':
      return { name: Emotion.Angry, intensity: payload.intensity }
    case 'think':
      return { name: Emotion.Think, intensity: payload.intensity }
    case 'surprised':
      return { name: Emotion.Surprise, intensity: payload.intensity }
    case 'awkward':
      return { name: Emotion.Awkward, intensity: payload.intensity }
    case 'question':
      return { name: Emotion.Question, intensity: payload.intensity }
    case 'curious':
      return { name: Emotion.Curious, intensity: payload.intensity }
    case 'neutral':
      return { name: Emotion.Neutral, intensity: payload.intensity }
    default:
      return undefined
  }
}

chatHookCleanups.push(streamingControl.onSignal(async (signal) => {
  if (signal.type === 'act') {
    const act = normalizeActPayload(signal.payload)
    let explicitAnimationMotion = false

    if (stageModelRenderer.value === 'animation') {
      if (act.motion) {
        animationSceneRef.value?.playAction(act.motion, act.motionDuration)
        explicitAnimationMotion = true
      }
      if (act.expression)
        animationSceneRef.value?.playExpression(act.expression.name)
    }

    if (act.emotion && !explicitAnimationMotion) {
      const emotion = toStageEmotionPayload(act.emotion)
      if (!emotion)
        return

      // eslint-disable-next-line no-console
      console.debug('emotion detected', emotion)
      emotionsQueue.enqueue(emotion)
    }
    return
  }

  if (signal.type === 'delay') {
    // eslint-disable-next-line no-console
    console.debug('delay detected', signal.seconds)
    await sleep(signal.seconds * 1000)
  }
}))

// Play special token: plugin CALL, delay, or emotion.
async function playSpecialToken(
  special: string,
  options?: {
    turnId?: string
    intentId?: string
    streamId?: string
  },
) {
  await streamingControl.dispatchWith(special, {
    turnId: options?.turnId,
    intentId: options?.intentId,
    streamId: options?.streamId,
  })
}

const voice = useVoiceStore()
// The analysis tap sits before the user volume, so a low playback volume must
// not change what a later analyser reads.
const speechAnalysis = audioContext.createGain()
const speechDestination = audioContext.createGain()
speechAnalysis.connect(speechDestination)
speechDestination.connect(audioContext.destination)
// setTargetAtTime smooths slider drags into the gain, so volume changes do not click.
watch(speechVolume, (volume) => {
  speechDestination.gain.setTargetAtTime(volume, audioContext.currentTime, 0.05)
}, { immediate: true })
const playback = new Playback(new BrowserPlayback(audioContext, {
  destination: speechAnalysis,
}))
let playingCount = 0

function resetSpeakingState() {
  nowSpeaking.value = false
}

// A response leaves the active turns after its playback drains, or at once
// when it is canceled or interrupted.
watch(() => voice.activeTurns, (turns) => {
  if (turns.length === 0)
    speechVoicing.value = false
})

const cards = useAiriCardStore()
const disconnectVoiceOutput = voice.connectOutput((turn) => {
  const output = {
    playback,
    onSpecial: (special: string) => void playSpecialToken(special, { turnId: turn.turnId }),
    onPlaybackStart: ({ text }: { text: string }) => {
      playingCount += 1
      nowSpeaking.value = true
      speechVoicing.value = true
      assistantCaption.value += ` ${text}`
      try {
        postCaption({ type: 'caption-assistant', text })
        postPresent({ type: 'assistant-append', text })
      }
      catch (error) {
        console.error('Speech presentation channel failed', error)
      }
    },
    onPlaybackEnd: () => {
      playingCount -= 1
      if (playingCount === 0)
        resetSpeakingState()
    },
  }
  if (speechMuted.value)
    return { ...output, synthesize: async () => null }
  try {
    const characterId = chatSession.sessionMetas[turn.sessionId]?.characterId
    if (!characterId)
      throw new Error('The response session has no character')
    return speechStore.createOutput(turn, cards.getModules(characterId).speech, output, audioContext)
  }
  catch (error) {
    // Text replies remain available when optional speech output is not configured.
    console.error('Speech output is unavailable', error)
    return { ...output, synthesize: async () => null }
  }
})

watch(speechMuted, (muted) => {
  if (muted) {
    for (const turn of voice.activeTurns)
      voice.getSpeech(turn)?.cancel('Speech muted')
  }
})

// Only a reply that speaks drives speech and expression. Background work and scene replies never speak here.
function holdsVoice(context: { speaks?: boolean }) {
  return context.speaks ?? false
}

chatHookCleanups.push(onBeforeMessageComposed(async (_message, context) => {
  if (!holdsVoice(context))
    return
  voice.startResponse(context)
  if (context.sessionId === chatSession.activeSessionId)
    resetAssistantSpeechSurface('new-message')
}))

chatHookCleanups.push(onTokenLiteral(async (literal, context) => {
  if (holdsVoice(context) && !speechMuted.value)
    await voice.getSpeech(context)?.write(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special, context) => {
  if (!holdsVoice(context))
    return
  if (speechMuted.value)
    await playSpecialToken(special, { turnId: context.turnId })
  else
    voice.getSpeech(context)?.special(special)
}))

chatHookCleanups.push(onStreamEnd(async (context) => {
  void voice.finishResponse(context).catch(error => console.error('Speech response completion failed', error))
}))

chatHookCleanups.push(onAssistantResponseEnd(async (_message, context) => {
  if (!holdsVoice(context))
    return
  void voice.finishResponse(context).catch(error => console.error('Speech response completion failed', error))
}))

// Resume audio context on first user interaction (browser requirement)
let audioContextResumed = false
function resumeAudioContextOnInteraction() {
  if (audioContextResumed || !audioContext)
    return
  audioContextResumed = true
  audioContext.resume().catch(() => {
    // Ignore errors - audio context will be resumed when needed
  })
}

// The listeners close over this setup scope, so a listener that outlives the
// stage keeps the whole unmounted stage alive.
// `useEventListener` removes them on unmount if no interaction came first.
useEventListener(['click', 'touchstart', 'keydown'], resumeAudioContextOnInteraction, { once: true, passive: true })

watch([stageModelRenderer, () => props.paused], ([renderer]) => {
  if (renderer === 'godot')
    componentState.value = 'mounted'
}, { immediate: true })

function canvasElement() {
  if (stageModelRenderer.value === 'animation')
    return animationSceneRef.value?.canvasElement()
}

function readRenderTargetRegionAtClientPoint(_clientX: number, _clientY: number, _radius: number) {
  // Only a render target backed scene can answer this. The video renderer draws to a 2D canvas.
  return null
}

async function captureCharacterFrame() {
  if (stageModelRenderer.value === 'animation')
    return animationSceneRef.value?.captureFrame()
}

onUnmounted(() => {
  disposePlaybackStateHandler()
  chatHookCleanups.forEach(dispose => dispose?.())
  disconnectVoiceOutput()
  speechAnalysis.disconnect()
  speechDestination.disconnect()
})

defineExpose({
  canvasElement,
  /**
   * The element that shows the character, when the renderer draws no canvas in
   * the DOM. The desktop window uses it for its pointer hit test.
   */
  stageSurfaceElement: () => {
    if (stageModelRenderer.value === 'animation')
      return animationSceneRef.value?.surfaceElement() ?? null
    return null
  },
  /**
   * The frame already carries the scene: the renderer paints the background and
   * the character into the canvas it draws to.
   */
  captureFrame: captureCharacterFrame,
  readRenderTargetRegionAtClientPoint,
  setExpression: async (expression: string) => {
    animationSceneRef.value?.setExpression(expression)
  },
})
</script>

<template>
  <div relative h-full w-full>
    <div relative h-full w-full>
      <VideoAnimationScene
        v-if="stageModelRenderer === 'animation' && showStage"
        ref="animationSceneRef"
        v-model:state="componentState"
        :background-url="activeBackgroundUrl"
        min-w="50% <lg:full"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :paused="paused"
        :now-speaking="nowSpeaking"
        @error="reportStageRenderError"
      />
      <div
        v-if="stageModelRenderer === 'godot'"
        :class="[
          'h-full w-full',
          'flex items-center justify-center',
          'px-4 py-6',
        ]"
      >
        <div
          :class="[
            'w-96 max-w-full',
            'min-h-32',
            'flex items-center justify-center',
          ]"
        >
          <Callout label="Godot Stage (Experimental)">
            <p>Godot Stage (experimental) is running...</p>
          </Callout>
        </div>
      </div>

      <StageAvatarModelMissing
        v-if="avatarModelPrompt"
        :reason="avatarModelPrompt"
        :name="activeCard?.name ?? ''"
        @select="emit('selectAvatarModel')"
      />
      <StageRenderError
        v-if="stageRenderError"
        :error="stageRenderError"
        :renderer="stageModelRenderer ?? 'Model'"
        :model-id="stageModelSelected"
        @retry="retryStageRenderer"
      />
    </div>
  </div>
</template>
