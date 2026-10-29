import type { BuiltinCharacter, CharacterAppearance } from './characters'

import { useCallback, useEffect, useMemo } from 'react'

import { getDesktopBridge } from '../desktop/bridge'
import { readStored, useStoredValue, writeStored } from '../settings/persisted'
import {
  getActiveCharacterId,
  loadBuiltinCharacters,
  normalizeAppearance,
} from './characters'

/** The instance the chat panel talks to. */
export const chatInstanceKey = 'aipets:react:chat/instance'

/**
 * One pet on the desktop.
 *
 * The user can open several instances of one character. Each pet window reads
 * the character and the appearance of its own instance, so a change here
 * reaches only that window.
 */
export interface CharacterInstance {
  id: string
  characterId: string
  appearance: CharacterAppearance
  /** Whether the stage and the desktop show this instance. */
  enabled: boolean
}

/** Ordered instance list. The desktop host creates one window per entry. */
export const characterInstancesKey = 'aipets:react:character/instances'

/** Stable fallback, so a render does not create a new array. */
const emptyInstances: CharacterInstance[] = []

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Drops malformed entries, so a bad write cannot break the settings page. */
export function normalizeInstances(value: unknown): CharacterInstance[] {
  if (!Array.isArray(value))
    return []

  const instances: CharacterInstance[] = []
  for (const entry of value) {
    if (!isRecord(entry))
      continue
    if (typeof entry.id !== 'string' || !entry.id)
      continue
    if (typeof entry.characterId !== 'string' || !entry.characterId)
      continue

    instances.push({
      id: entry.id,
      characterId: entry.characterId,
      appearance: normalizeAppearance(entry.appearance),
      // A stored instance without the flag is on the stage.
      enabled: entry.enabled !== false,
    })
  }

  return instances
}

export function readInstances(): CharacterInstance[] {
  return normalizeInstances(readStored<unknown>(characterInstancesKey, null))
}

export function writeInstances(instances: CharacterInstance[]) {
  writeStored(characterInstancesKey, instances)
}

/** Creates an instance that starts from the look the character folder ships. */
export function createInstance(character: Pick<BuiltinCharacter, 'id' | 'appearance'>): CharacterInstance {
  return {
    id: `${character.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    characterId: character.id,
    appearance: { ...character.appearance },
    enabled: true,
  }
}

/**
 * The ordinal of one instance among every instance.
 *
 * The number counts all instances in the stored order, not only the instances
 * of one character. A smaller number keeps the pet above an overlapping pet.
 */
export function instanceNumber(instances: CharacterInstance[], instance: CharacterInstance): number {
  return instances.findIndex(entry => entry.id === instance.id) + 1
}

/** One instance, numbered the way the settings pages show it. */
export interface NumberedInstance {
  instance: CharacterInstance
  number: number
}

/**
 * Groups the instances of one character in display order.
 *
 * Each number counts every instance, so two characters show different numbers.
 */
export function instancesOfCharacter(instances: CharacterInstance[], characterId: string): NumberedInstance[] {
  return instances
    .map((instance, index) => ({ instance, number: index + 1 }))
    .filter(entry => entry.instance.characterId === characterId)
}

/** A key that keeps one setting to one instance. */
export function instanceScopedKey(base: string, instanceId: string): string {
  return `${base}#${instanceId}`
}

/**
 * The persona label of one instance.
 *
 * The chat, the memory index, and the memory tools share it. A label uses the
 * character id and the instance number, so a new display name keeps the label.
 */
export function instancePersonaId(characterId: string, number: number): string {
  return `${characterId}#${number}`
}

/** The instance the chat panel talks to, or the first instance as a fallback. */
export function resolveChatInstance(instances: CharacterInstance[], instanceId: string): CharacterInstance | null {
  return instances.find(instance => instance.id === instanceId) ?? instances[0] ?? null
}

/**
 * Opens the default pet on first run.
 *
 * The default is the active character of the web stage, or the first built-in
 * character. An existing list is left alone.
 */
export async function ensureDefaultInstance(): Promise<void> {
  if (readInstances().length)
    return

  let characters: BuiltinCharacter[]
  try {
    characters = await loadBuiltinCharacters()
  }
  catch {
    return
  }

  const fallback = characters[0]
  if (!fallback)
    return

  const activeId = getActiveCharacterId()
  const character = characters.find(entry => entry.id === activeId) ?? fallback
  writeInstances([createInstance(character)])
}

/** Reconciles the desktop pet windows with the enabled instances. */
export function syncPetWindows(instances: CharacterInstance[]) {
  const visible = instances.filter(instance => instance.enabled)

  void getDesktopBridge()?.syncPetInstances(
    visible.map(instance => ({ id: instance.id, characterId: instance.characterId })),
  )
}

/** Reads the instance list and keeps the pet windows in step with it. */
export function useCharacterInstances() {
  const [stored, setStored] = useStoredValue<unknown>(characterInstancesKey, emptyInstances)
  const instances = useMemo(() => normalizeInstances(stored), [stored])
  const update = useCallback((next: CharacterInstance[]) => setStored(next), [setStored])

  useEffect(() => {
    syncPetWindows(instances)
  }, [instances])

  return [instances, update] as const
}
