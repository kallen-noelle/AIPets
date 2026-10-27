<script setup lang="ts">
import type { DisplayModel } from '../../../../stores/display-models'
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { Button, Callout, ScrollableArea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useSettings } from '../../../../stores/settings'
import { ModelSelectorDialog } from '../../dialogs/model-selector'

interface ModelSettingsPanelProps {
  settingsClass?: string | string[]
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
}

defineProps<ModelSettingsPanelProps>()

const { t } = useI18n()
const modelSelectorOpen = ref(false)
const settingsStore = useSettings()
const airiCardStore = useAiriCardStore()
const { stageModelSelected, stageModelSelectedDisplayModel } = storeToRefs(settingsStore)

async function handleModelPick(selectedModel: DisplayModel | undefined) {
  stageModelSelected.value = selectedModel?.id ?? ''
  await airiCardStore.setActiveCardDefaultAvatarModel(selectedModel?.id)
  await settingsStore.updateStageModel()
}
</script>

<template>
  <ScrollableArea
    :class="[
      'z-10',
      settingsClass,
    ]"
  >
    <div :class="['flex flex-col gap-2 p-2']">
      <Callout :label="t('settings.model-select.panel-callout.support-status-header')">
        <i18n-t keypath="settings.model-select.panel-callout.support-status" tag="p">
          <template #select-button>
            <strong>{{ t('settings.model-select.select-model.button') }}</strong>
          </template>
          <template #zip>
            <code>.zip</code>
          </template>
        </i18n-t>
        <p>
          {{ t('settings.model-select.panel-callout.model-type-example') }}
        </p>
      </Callout>
      <div :class="['flex flex-wrap items-center gap-2']">
        <ModelSelectorDialog v-model:show="modelSelectorOpen" :selected-model="stageModelSelectedDisplayModel" @pick="handleModelPick">
          <Button>
            {{ t('settings.model-select.select-model.button') }}
          </Button>
        </ModelSelectorDialog>
        <slot name="actions" />
      </div>
    </div>
  </ScrollableArea>
</template>
