import type { AnimationIntent, AnimationPlaybackSnapshot } from './types'

import { defineEventa } from '@moeru/eventa'

export const characterAnimationPlayEvent = defineEventa<{ clipId: string, fadeMs?: number }>('proj-aipets:character-animation:play')
export const characterAnimationSetIntentEvent = defineEventa<AnimationIntent>('proj-aipets:character-animation:set-intent')
export const characterAnimationPauseEvent = defineEventa<void>('proj-aipets:character-animation:pause')
export const characterAnimationResumeEvent = defineEventa<void>('proj-aipets:character-animation:resume')
export const characterAnimationSnapshotEvent = defineEventa<AnimationPlaybackSnapshot>('proj-aipets:character-animation:snapshot')
