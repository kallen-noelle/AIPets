<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import VideoAnimationScene from '../../../scenes/VideoAnimationScene.vue'

import { useSettings } from '../../../../stores/settings'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from './runtime'

const emit = defineEmits<{
  (e: 'runtimeSnapshotChanged', value: ModelSettingsRuntimeSnapshot): void
}>()

const settingsStore = useSettings()
const animationComponentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const previewStageInstanceId = `model-settings-preview-stage:${Math.random().toString(36).slice(2, 10)}`

const {
  stageModelSelected,
  stageModelSelectedUrl,
  stageModelRenderer,
} = storeToRefs(settingsStore)

const runtimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!stageModelSelectedUrl.value

  if (stageModelRenderer.value === 'animation') {
    const phase = resolveComponentStateToRuntimePhase(animationComponentState.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: previewStageInstanceId,
      renderer: 'animation',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: phase === 'mounted',
      updatedAt: Date.now(),
    })
  }

  return createEmptyModelSettingsRuntimeSnapshot({
    ownerInstanceId: previewStageInstanceId,
    updatedAt: Date.now(),
  })
})

watch(runtimeSnapshot, snapshot => emit('runtimeSnapshotChanged', snapshot), { immediate: true })
</script>

<template>
  <VideoAnimationScene
    v-if="stageModelRenderer === 'animation'"
    v-model:state="animationComponentState"
    :model-src="stageModelSelectedUrl"
    :model-id="stageModelSelected"
  />
</template>
