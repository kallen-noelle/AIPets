import type { AnimationIntent, AnimationPlaybackSnapshot } from './types'

import { defineEventa } from '@moeru/eventa'

export const characterAnimationPlayEvent = defineEventa<{ clipId: string, fadeMs?: number }>('proj-airi:character-animation:play')
export const characterAnimationSetIntentEvent = defineEventa<AnimationIntent>('proj-airi:character-animation:set-intent')
export const characterAnimationPauseEvent = defineEventa<void>('proj-airi:character-animation:pause')
export const characterAnimationResumeEvent = defineEventa<void>('proj-airi:character-animation:resume')
export const characterAnimationSnapshotEvent = defineEventa<AnimationPlaybackSnapshot>('proj-airi:character-animation:snapshot')
