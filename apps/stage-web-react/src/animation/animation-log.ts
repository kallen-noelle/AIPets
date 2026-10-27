/**
 * Lightweight cross-component log for the animation director pipeline.
 *
 * Every entry has a phase string so the consumer can group them.
 * The bus is synchronous — log writes fire listeners immediately.
 * Components import `animationLog` and call `.write()` from anywhere.
 */

export interface AnimationLogEntry {
  phase: string
  message: string
  detail?: unknown
  /** millis since navigation start, for ordering */
  t: number
}

export type AnimationLogListener = (entry: AnimationLogEntry) => void

class AnimationLogBus {
  private listeners = new Set<AnimationLogListener>()
  private entries: AnimationLogEntry[] = []
  private max = 200

  write(phase: string, message: string, detail?: unknown): AnimationLogEntry {
    const entry: AnimationLogEntry = { phase, message, detail, t: performance.now() }
    this.entries.push(entry)
    if (this.entries.length > this.max)
      this.entries.splice(0, this.entries.length - this.max)
    for (const listener of this.listeners)
      listener(entry)
    return entry
  }

  snapshot(): AnimationLogEntry[] {
    return [...this.entries]
  }

  clear(): void {
    this.entries.length = 0
  }

  subscribe(listener: AnimationLogListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const animationLog = new AnimationLogBus()
