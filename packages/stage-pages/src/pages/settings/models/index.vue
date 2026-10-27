<script setup lang="ts">
import { ModelSettings } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings'
</script>

<template>
  <div flex class="relative h-full flex-col-reverse md:flex-row">
    <ModelSettings
      settings-class="w-100% md:w-40% lg:w-40% xl:w-25% 2xl:w-30% h-fit sm:max-h-80dvh relative"
    />
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 15 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:people-nearby-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.models.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.models.description
  icon: i-solar:people-nearby-bold-duotone
  settingsEntry: true
  order: 4
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
