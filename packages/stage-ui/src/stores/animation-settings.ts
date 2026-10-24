import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/** Settings that the video renderer reads on every clip and every pointer press. */
export const useAnimationSettingsStore = defineStore('animation-settings', () => {
  // Pinia synchronization is the only cross-window state channel, so storage
  // events must not echo a second copy of the same state between Electron renderers.
  const persistenceOptions = { listenToStorageChanges: false }

  /** Overrides the fade from the pack and the clip when set. */
  const fadeMs = useLocalStorageManualReset<number | undefined>('animation-fade-ms', undefined, persistenceOptions)
  const mirror = useLocalStorageManualReset<boolean>('animation-mirror', false, persistenceOptions)
  const scale = useLocalStorageManualReset<number>('animation-scale', 1, persistenceOptions)
  const clickEnabled = useLocalStorageManualReset<boolean>('animation-click-enabled', true, persistenceOptions)

  function resetState() {
    fadeMs.reset()
    mirror.reset()
    scale.reset()
    clickEnabled.reset()
  }

  return {
    fadeMs,
    mirror,
    scale,
    clickEnabled,
    resetState,
  }
})
