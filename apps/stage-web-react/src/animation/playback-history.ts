const maxRecent = 8
let recent: string[] = []

/**
 * Records one explicit clip playback for director de-duplication.
 *
 * Base-chain and loop clips are not recorded. They run continuously, so they
 * say nothing about what the character just chose to do.
 */
export function recordClipPlayed(clipId: string): void {
  recent = [clipId, ...recent.filter(id => id !== clipId)].slice(0, maxRecent)
}

/** Clips the character just played, newest first. */
export function recentClipIds(limit = 5): string[] {
  return recent.slice(0, Math.max(0, limit))
}

export function resetPlaybackHistory(): void {
  recent = []
}
