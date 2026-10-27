export type DirectorAutonomy = 'L1' | 'L2' | 'L3'

export const directorModelKey = 'airi:react:animation/director-model'
export const directorAutonomyKey = 'airi:react:animation/director-autonomy'
export const directorMaxCuesKey = 'airi:react:animation/director-max-cues'

export const directorDefaults = {
  model: '',
  autonomy: 'L2' as DirectorAutonomy,
  maxCues: 4,
}

/**
 * Resolves the cue limit for one autonomy level.
 *
 * L1 is advisory and limited to two strong cues. L2 keeps the configured
 * limit. L3 can use one extra cue, up to four.
 */
export function cueLimitFor(autonomy: DirectorAutonomy, configured: number): number {
  const limit = Math.min(4, Math.max(1, Math.round(configured)))
  if (autonomy === 'L1')
    return Math.min(2, limit)
  if (autonomy === 'L3')
    return Math.min(4, limit + 1)
  return limit
}
