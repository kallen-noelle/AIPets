import type { DisplayModelURL } from '../display-models'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'
import { useSettingsStageModel } from './stage-model'

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return {
    ...actual,
    useEventListener: vi.fn(),
  }
})

describe('settings stage model store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ROOT CAUSE:
  //
  // The runtime replaced a missing Display Model with a preset. The selected
  // Avatar Model still referenced the missing resource, so Character state and
  // renderer state described different models.
  //
  // We fixed this by keeping the resource identity and disabling the renderer.
  it('disables the renderer when the selected Avatar Model resource is missing', async () => {
    const displayModelsStore = useDisplayModelsStore()
    const ensureDisplayModelSpy = vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockResolvedValue(undefined)

    const store = useSettingsStageModel()
    store.stageModelSelected = 'display-model-missing'

    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe('display-model-missing')
    expect(store.stageModelSelectedDisplayModel).toBeUndefined()
    expect(store.stageModelSelectedUrl).toBeUndefined()
    expect(store.stageModelRenderer).toBe('disabled')
    expect(store.stageModelUnavailable).toBe(true)
    expect(ensureDisplayModelSpy).toHaveBeenCalledWith('display-model-missing')
  })

  it('keeps a cloud model selected when its download fails', async () => {
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const store = useSettingsStageModel()
    store.stageModelSelected = 'display-model-cloud'

    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe('display-model-cloud')
    // The model still exists in the account, so the Stage does not ask for another model.
    expect(store.stageModelUnavailable).toBe(false)
  })

  it('routes animation packs to the animation renderer', async () => {
    const animationModel: DisplayModelURL = {
      id: 'animation-model',
      format: DisplayModelFormat.AnimationZip,
      type: 'url',
      url: 'https://example.com/character.zip',
      name: 'Animation character',
      importedAt: 1,
    }
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockResolvedValue(animationModel)

    vi.stubGlobal('window', {})
    const store = useSettingsStageModel()
    store.stageModelSelected = animationModel.id

    await store.initializeStageModel()

    expect(store.stageModelSelectedDisplayModel).toEqual(animationModel)
    expect(store.stageModelSelectedUrl).toBe(animationModel.url)
    expect(store.stageModelRenderer).toBe('animation')
  })

  it('publishes the startup model after the renderer is ready', async () => {
    const animationModel: DisplayModelURL = {
      id: 'animation-model',
      format: DisplayModelFormat.AnimationZip,
      type: 'url',
      url: 'https://example.com/character.zip',
      name: 'Animation character',
      importedAt: 1,
    }
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockResolvedValue(animationModel)

    vi.stubGlobal('window', {})
    const store = useSettingsStageModel()
    store.stageModelSelected = animationModel.id

    await store.initializeStageModel()

    expect(store.stageModelRenderer).toBe('animation')
    expect(store.stageModelSelectedUrl).toBe(animationModel.url)
  })
})
