export {
  affectEventDelta,
  affectLabels,
  affectLimits,
  affectStateSchema,
  applyAffectDelta,
  applyAffectEvent,
  createAffectState,
  decayAffect,
  defaultCharacterTraits,
  parseAffectState,
  resolveAffectLabel,
} from './affect'
export type {
  AffectBaseline,
  AffectDelta,
  AffectEventKind,
  AffectLabel,
  AffectState,
  AffectStateParseResult,
  CharacterTraits,
} from './affect'
export {
  characterCatalogSchema,
  clipHasAnyTag,
  createCatalogIndex,
  findClipDescriptor,
  parseCharacterCatalog,
} from './catalog'
export type {
  CatalogIndex,
  CatalogParseResult,
  CharacterCatalog,
  ClipDescriptor,
  ClipRole,
  ClipSemanticSource,
} from './catalog'
export { PerformancePlanExecutor } from './executor'
export type {
  ExecutedCue,
  PerformancePlanExecutorOptions,
  PlanExecutionResult,
  PlanExecutorDrop,
  PlanExecutorDropReason,
  PlanTimelineEvent,
} from './executor'
export { parseAnimationManifest } from './manifest'
export {
  advanceDrives,
  createDrivesState,
  createModeState,
  defaultModeConfig,
  noteUserInteraction,
  resolveMode,
} from './modes'
export type {
  CharacterMode,
  DrivesState,
  ModeConfig,
  ModeContext,
  ModeResolution,
  ModeState,
  ModeTransition,
} from './modes'
export {
  clampPetPosition,
  createPetPhysicalState,
  defaultPetPhysicsOptions,
  flingPetPhysicalState,
  stepPetPhysics,
} from './physics'
export type { PetBounds, PetPhysicalState, PetPhysicsOptions, PetPoint } from './physics'
export { WeightedPicker } from './picker'
export {
  comparePlanAnchors,
  createEmptyPerformancePlan,
  parsePerformancePlan,
  performancePlanSchema,
  validatePerformancePlan,
} from './plan'
export type {
  PerformanceAffectDelta,
  PerformanceCue,
  PerformancePlan,
  PerformancePlanParseResult,
  PlanAnchor,
  PlanValidationOptions,
  PlanValidationResult,
} from './plan'
export { manifestSchema } from './schema'
export type { AnimationManifest, RawClipEntry, RawEmotionEntry } from './schema'
export { AnimationController } from './state'
export type { AnimationControllerOptions } from './state'
export type {
  AnimationClockPort,
  AnimationCommand,
  AnimationEvent,
  AnimationIntent,
  AnimationPackStore,
  AnimationPlaybackSnapshot,
  AnimationPlayerPort,
  BaseChain,
  ClickArea,
  EmotionClips,
  LoadedPack,
  ManifestParseResult,
  NormalizedClip,
  PackSummary,
} from './types'
