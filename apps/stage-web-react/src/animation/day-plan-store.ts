import { readStored, writeStored } from '../settings/persisted'

/**
 * One character's persisted day plan plus playback progress.
 *
 * The raw plan stays unknown here so a corrupted value never crashes the
 * stage. `readDayPlan` validates it before use.
 */
export interface DayPlanRecord {
  plan: unknown
  lastGeneratedAt: number
  lastPlayedBlockId?: string
  lastPlayedAt?: number
  lastInteractionAt?: number
  updatedAt: number
}

export function dayPlanStorageKey(characterId: string): string {
  return `airi:react:character/${characterId}/day-plan`
}

function isDayPlanRecord(value: unknown): value is DayPlanRecord {
  if (typeof value !== 'object' || value === null)
    return false

  const entry = value as Partial<DayPlanRecord>
  return 'plan' in entry
    && typeof entry.lastGeneratedAt === 'number'
    && Number.isFinite(entry.lastGeneratedAt)
    && typeof entry.updatedAt === 'number'
}

export function readDayPlanRecord(characterId: string): DayPlanRecord | null {
  const raw = readStored<unknown>(dayPlanStorageKey(characterId), null)
  return isDayPlanRecord(raw) ? raw : null
}

export function writeDayPlanRecord(characterId: string, record: DayPlanRecord): void {
  writeStored(dayPlanStorageKey(characterId), record)
}

export function patchDayPlanRecord(characterId: string, patch: Partial<DayPlanRecord>): DayPlanRecord | null {
  const current = readDayPlanRecord(characterId)
  if (!current)
    return null

  const next: DayPlanRecord = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  }
  writeDayPlanRecord(characterId, next)
  return next
}
