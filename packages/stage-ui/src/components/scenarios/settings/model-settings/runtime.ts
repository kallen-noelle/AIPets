export type ModelSettingsRuntimeRenderer = 'disabled' | 'animation'
export type ModelSettingsRuntimePhase = 'pending' | 'loading' | 'binding' | 'mounted' | 'no-model' | 'error'

export interface ModelSettingsRuntimeSnapshot {
  ownerInstanceId: string
  renderer: ModelSettingsRuntimeRenderer
  phase: ModelSettingsRuntimePhase
  controlsLocked: boolean
  previewAvailable: boolean
  canCapturePreview: boolean
  lastError?: string
  updatedAt: number
}

export function createEmptyModelSettingsRuntimeSnapshot(
  overrides: Partial<ModelSettingsRuntimeSnapshot> = {},
): ModelSettingsRuntimeSnapshot {
  return {
    ownerInstanceId: '',
    renderer: 'disabled',
    phase: 'pending',
    controlsLocked: false,
    previewAvailable: false,
    canCapturePreview: false,
    updatedAt: 0,
    ...overrides,
  }
}

/** Resolves which settings component the model settings panel should mount. */
export function resolveModelSettingsPanelRenderer(options: {
  runtimeRenderer: ModelSettingsRuntimeRenderer
}): ModelSettingsRuntimeRenderer {
  return options.runtimeRenderer
}

/** Maps component load state into the shared model settings runtime phase. */
export function resolveComponentStateToRuntimePhase(
  componentState: 'pending' | 'loading' | 'mounted',
  options: {
    hasModel?: boolean
  } = {},
): ModelSettingsRuntimePhase {
  if (options.hasModel === false)
    return 'no-model'

  return componentState
}
