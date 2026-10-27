<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { ref } from 'vue'

import ModelSettingsPanel from './panel.vue'
import ModelSettingsPreviewStage from './preview-stage.vue'

import { createEmptyModelSettingsRuntimeSnapshot } from './runtime'

defineProps<{
  settingsClass?: string | string[]
}>()

const runtimeSnapshot = ref<ModelSettingsRuntimeSnapshot>(createEmptyModelSettingsRuntimeSnapshot())

function handleRuntimeSnapshotChanged(nextSnapshot: ModelSettingsRuntimeSnapshot) {
  runtimeSnapshot.value = nextSnapshot
}
</script>

<template>
  <ModelSettingsPanel
    :runtime-snapshot="runtimeSnapshot"
    :settings-class="settingsClass"
  />
  <ModelSettingsPreviewStage
    @runtime-snapshot-changed="handleRuntimeSnapshotChanged"
  />
</template>
