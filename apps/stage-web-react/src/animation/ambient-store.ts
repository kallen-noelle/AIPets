import { readStored, writeStored } from '../settings/persisted'

/**
 * One character's persisted ambient program.
 *
 * The raw program stays unknown here so a corrupted value never crashes the
 * stage. `parseAmbientProgram` validates it before use.
 */
export interface AmbientProgramRecord {
  program: unknown
  generatedAt: number
  updatedAt: number
}

export function ambientProgramStorageKey(characterId: string): string {
  return `aipets:react:character/${characterId}/ambient-program`
}

function isAmbientProgramRecord(value: unknown): value is AmbientProgramRecord {
  if (typeof value !== 'object' || value === null)
    return false

  const entry = value as Partial<AmbientProgramRecord>
  return 'program' in entry
    && typeof entry.generatedAt === 'number'
    && Number.isFinite(entry.generatedAt)
    && typeof entry.updatedAt === 'number'
}

export function readAmbientProgramRecord(characterId: string): AmbientProgramRecord | null {
  const raw = readStored<unknown>(ambientProgramStorageKey(characterId), null)
  return isAmbientProgramRecord(raw) ? raw : null
}

export function writeAmbientProgramRecord(characterId: string, record: AmbientProgramRecord): void {
  writeStored(ambientProgramStorageKey(characterId), record)
}
