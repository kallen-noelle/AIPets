import type { DisplayModelURL } from '../display-models'
import type { AiriCard } from './airi-card'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'
import { useSettingsStageModel } from '../settings/stage-model'
import { useAiriCardStore } from './airi-card'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

function animationModel(id: string): DisplayModelURL {
  return {
    id,
    format: DisplayModelFormat.AnimationZip,
    type: 'url',
    url: `https://example.test/${id}.zip`,
    name: id,
    importedAt: 1,
  }
}

// https://github.com/moeru-ai/airi/pull/2458
// ROOT CAUSE:
//
// Up to v0.12.0-beta.5 the Stage model was also stored in `settings/stage/model`.
// PR #2458 stopped reading it, so an upgrade showed the bundled preset.
//
// We fixed this by moving the key once into the active card, only while that
// card shows the bundled preset.
describe('pr #2458 migrates the global Stage model of v0.12.0-beta.5 and earlier', () => {
  const legacyStageModelKey = 'settings/stage/model'
  const pinias: Array<ReturnType<typeof createPinia>> = []

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    for (const pinia of pinias.splice(0))
      disposePinia(pinia)
    localStorage.clear()
  })

  /** Starts the app again on the cards and keys that `localStorage` holds. */
  async function launch(seededDisplayModels: DisplayModelURL[] = []) {
    const pinia = createPinia()
    createApp({}).use(pinia).use(PiniaColada)
    pinias.push(pinia)
    setActivePinia(pinia)
    useDisplayModelsStore().displayModels = seededDisplayModels
    const stageModelStore = useSettingsStageModel()
    const cardStore = useAiriCardStore()
    await cardStore.initialize()
    // The card map writes to `localStorage` in a watcher. Let it flush before the next launch.
    await nextTick()
    return { cardStore, stageModelStore }
  }

  function defaultDisplayModelId(card: AiriCard | undefined) {
    const extension = card?.extensions.airi
    return extension?.avatarModels.find(model => model.id === extension.defaultAvatarModelId)?.displayModelId
  }

  it('moves the global Stage model into a card that shows the bundled preset', async () => {
    await launch()
    localStorage.setItem(legacyStageModelKey, 'display-model-legacy')

    const { cardStore, stageModelStore } = await launch([animationModel('display-model-legacy')])

    expect(defaultDisplayModelId(cardStore.cards.get('default'))).toBe('display-model-legacy')
    expect(stageModelStore.stageModelSelected).toBe('display-model-legacy')
    expect(localStorage.getItem(legacyStageModelKey)).toBeNull()
  })

  it('keeps a model chosen on the card over a stale global Stage model', async () => {
    const { cardStore: firstRun } = await launch([animationModel('display-model-card')])
    await firstRun.setActiveCardDefaultAvatarModel('display-model-card')
    await nextTick()
    localStorage.setItem(legacyStageModelKey, 'display-model-legacy')

    const { cardStore, stageModelStore } = await launch([
      animationModel('display-model-card'),
      animationModel('display-model-legacy'),
    ])

    expect(defaultDisplayModelId(cardStore.cards.get('default'))).toBe('display-model-card')
    expect(stageModelStore.stageModelSelected).toBe('display-model-card')
    expect(localStorage.getItem(legacyStageModelKey)).toBeNull()
  })

  it('leaves the cards unchanged without a global Stage model', async () => {
    await launch()
    const storedCards = localStorage.getItem('airi-cards')

    const { cardStore, stageModelStore } = await launch()

    expect(defaultDisplayModelId(cardStore.cards.get('default'))).toBe('preset-animation-1')
    expect(stageModelStore.stageModelSelected).toBe('preset-animation-1')
    expect(localStorage.getItem('airi-cards')).toBe(storedCards)
  })

  it('moves the global Stage model only once', async () => {
    await launch()
    localStorage.setItem(legacyStageModelKey, 'display-model-legacy')
    const { cardStore: migrated } = await launch([animationModel('display-model-legacy')])
    // The user selects the bundled preset again after the migration.
    await migrated.setActiveCardDefaultAvatarModel('preset-animation-1')
    await nextTick()

    const { cardStore, stageModelStore } = await launch()

    expect(defaultDisplayModelId(cardStore.cards.get('default'))).toBe('preset-animation-1')
    expect(stageModelStore.stageModelSelected).toBe('preset-animation-1')
  })
})
