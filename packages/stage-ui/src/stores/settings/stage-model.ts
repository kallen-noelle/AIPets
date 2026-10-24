import type {} from 'pinia-plugin-synced'

import type { DisplayModel } from '../display-models'

import { refManualReset, useEventListener } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { DisplayModelFormat, presetAnimationPackId, useDisplayModelsStore } from '../display-models'

export type StageModelRenderer = 'animation' | 'live2d' | 'vrm' | 'spine' | 'tachie' | 'mmd' | 'godot' | 'disabled' | undefined
type BuiltInStageModelRenderer = Exclude<StageModelRenderer, 'godot'>

const useStageModelSelectionStore = defineStore('settings-stage-model-selection', () => {
  // The active Character owns the durable Avatar Model references. This store
  // only replicates the current runtime selection between renderer windows.
  const selected = shallowRef('')

  function resetState() {
    selected.value = ''
  }

  return {
    selected,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})

export const useSettingsStageModel = defineStore('settings-stage-model', () => {
  const displayModelsStore = useDisplayModelsStore()
  const stageModelSelectionStore = useStageModelSelectionStore()
  const { selected: stageModelSelectedState } = storeToRefs(stageModelSelectionStore)
  let stageModelUpdateSequence = 0
  const stageModelSelected = computed<string>({
    get: () => stageModelSelectedState.value,
    set: (value) => {
      stageModelSelectedState.value = value
    },
  })
  const stageModelSelectedDisplayModel = refManualReset<DisplayModel | undefined>(undefined)
  const stageModelSelectedUrl = refManualReset<string | undefined>(undefined)
  const stageModelRenderer = refManualReset<StageModelRenderer>(undefined)
  const stageModelBuiltInRenderer = refManualReset<BuiltInStageModelRenderer>(undefined)
  // True when the selected model is not on this device and the account cannot download it.
  // The Stage then asks the user to select another model. A download in progress or a failed
  // download keeps it false, because the model still exists.
  const stageModelUnavailable = refManualReset<boolean>(false)

  const stageViewControlsEnabled = refManualReset<boolean>(false)

  function revokeStageModelUrl(url?: string) {
    if (url?.startsWith('blob:'))
      URL.revokeObjectURL(url)
  }

  function replaceStageModelUrl(nextUrl?: string) {
    if (stageModelSelectedUrl.value === nextUrl)
      return

    revokeStageModelUrl(stageModelSelectedUrl.value)
    stageModelSelectedUrl.value = nextUrl
  }

  function resolveBuiltInStageModelRenderer(model?: DisplayModel): BuiltInStageModelRenderer {
    if (!model) {
      return 'disabled'
    }

    switch (model.format) {
      case DisplayModelFormat.AnimationZip:
        return 'animation'
      case DisplayModelFormat.Live2dZip:
        return 'live2d'
      case DisplayModelFormat.VRM:
        return 'vrm'
      case DisplayModelFormat.SpineZip:
        return 'spine'
      case DisplayModelFormat.TachieZip:
        return 'tachie'
      case DisplayModelFormat.PMXZip:
      case DisplayModelFormat.PMXDirectory:
      case DisplayModelFormat.PMD:
        return 'mmd'
      default:
        return 'disabled'
    }
  }

  async function updateStageModel() {
    const requestId = ++stageModelUpdateSequence
    const selectedModelId = stageModelSelectedState.value || presetAnimationPackId
    stageModelUnavailable.value = false

    let model: Awaited<ReturnType<typeof displayModelsStore.ensureDisplayModelAvailable>>
    try {
      model = await displayModelsStore.ensureDisplayModelAvailable(selectedModelId)
    }
    catch (error) {
      // The selection stays. A cloud model that cannot download now is retried on the next update.
      console.error('[stage-model] failed to make the selected display model available:', error)
      return
    }
    if (requestId !== stageModelUpdateSequence)
      return

    if (!model) {
      replaceStageModelUrl(undefined)
      stageModelSelectedDisplayModel.value = undefined
      stageModelUnavailable.value = true
      stageModelBuiltInRenderer.value = 'disabled'
      if (stageModelRenderer.value !== 'godot')
        stageModelRenderer.value = 'disabled'
      return
    }

    // Only animation packs render now. A model saved with a removed format falls
    // back to the packaged pack instead of leaving the stage blank.
    if (model.format !== DisplayModelFormat.AnimationZip) {
      model = await displayModelsStore.ensureDisplayModelAvailable(presetAnimationPackId)
      if (!model || requestId !== stageModelUpdateSequence)
        return
    }

    let nextUrl: string
    if (model.type === 'file') {
      nextUrl = URL.createObjectURL(model.file)
      if (requestId !== stageModelUpdateSequence) {
        URL.revokeObjectURL(nextUrl)
        return
      }
    }
    else {
      nextUrl = model.url
    }

    const builtInRenderer = resolveBuiltInStageModelRenderer(model)

    // Browser startup consumes the one-time legacy reset before these refs publish.
    // Direct ThreeScene routes mount from the refs and cannot start with stale identity state.
    stageModelBuiltInRenderer.value = builtInRenderer
    if (stageModelRenderer.value !== 'godot')
      stageModelRenderer.value = builtInRenderer
    replaceStageModelUrl(nextUrl)
    stageModelSelectedDisplayModel.value = model
  }

  function setStageModelRenderer(renderer: StageModelRenderer) {
    stageModelRenderer.value = renderer
  }

  function restoreBuiltInStageModelRenderer() {
    stageModelRenderer.value = stageModelBuiltInRenderer.value ?? 'disabled'
  }

  async function initializeStageModel() {
    await updateStageModel()
  }

  useEventListener('unload', () => {
    revokeStageModelUrl(stageModelSelectedUrl.value)
  })

  watch(stageModelSelectedState, (_newValue, _oldValue) => {
    void updateStageModel()
  })

  async function resetState() {
    revokeStageModelUrl(stageModelSelectedUrl.value)

    stageModelSelectionStore.resetState()
    stageModelSelectedDisplayModel.reset()
    stageModelSelectedUrl.reset()
    stageModelRenderer.reset()
    stageModelBuiltInRenderer.reset()
    stageModelUnavailable.reset()
    stageViewControlsEnabled.reset()

    await updateStageModel()
  }

  return {
    stageModelRenderer,
    stageModelSelected,
    stageModelSelectedUrl,
    stageModelSelectedDisplayModel,
    stageModelUnavailable,
    stageViewControlsEnabled,

    initializeStageModel,
    restoreBuiltInStageModelRenderer,
    setStageModelRenderer,
    updateStageModel,
    resetState,
  }
})
