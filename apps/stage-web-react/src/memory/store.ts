import { useSyncExternalStore } from 'react'

import { readStored, writeStored } from '../settings/persisted'

/** One remembered fact. A character keeps it on its own card. A general memory reaches every card. */
export interface MemoryEntry {
  /** Short kebab-case name, unique within its scope. Tools address an entry by this name. */
  name: string
  /** One index line: the fact itself, or when the fact matters. */
  description: string
  body: string
  /** The character that owns this memory. Without it, the owner made the memory general. */
  persona?: string
  updatedAt: number
}

/** Same keys as the Vue memory store, so both apps read one list. */
export const memoryEnabledKey = 'memory/enabled'
export const memoryEntriesKey = 'memory/entries'

export const READ_MEMORY_TOOL_NAME = 'builtIn_readMemory'
export const WRITE_MEMORY_TOOL_NAME = 'builtIn_writeMemory'
export const FORGET_MEMORY_TOOL_NAME = 'builtIn_forgetMemory'

/**
 * Turns a free name into the kebab-case key that entries use.
 *
 * @example
 * normalizeMemoryName('Favorite Tea!')
 * // => 'favorite-tea'
 */
export function normalizeMemoryName(name: string): string {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

let enabled = readStored(memoryEnabledKey, true)
let entries = readStored<MemoryEntry[]>(memoryEntriesKey, [])

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners)
    listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function reload() {
  enabled = readStored(memoryEnabledKey, true)
  entries = readStored<MemoryEntry[]>(memoryEntriesKey, [])
  emit()
}

function replaceEntries(next: MemoryEntry[]) {
  writeStored(memoryEntriesKey, next)
  entries = next
  emit()
}

export function getMemoryEnabled(): boolean {
  return enabled
}

/** Returns the stored list. The array reference changes only when an entry changes. */
export function getMemoryEntries(): MemoryEntry[] {
  return entries
}

export function setMemoryEnabled(value: boolean) {
  writeStored(memoryEnabledKey, value)
  enabled = value
  emit()
}

function sortedEntries(): MemoryEntry[] {
  return [...entries].sort((left, right) => left.name.localeCompare(right.name))
}

/** General memories and the persona's own. */
export function visibleTo(personaId: string): MemoryEntry[] {
  return sortedEntries().filter(entry => !entry.persona || entry.persona === personaId)
}

/** The prompt index for a card: its own memories first, then the general ones. */
export function indexFor(personaId: string): string {
  const line = (entry: MemoryEntry) => `- ${entry.name}: ${entry.description}`
  const own = sortedEntries().filter(entry => entry.persona === personaId).map(line)
  const general = sortedEntries().filter(entry => !entry.persona).map(line)
  return [
    ...(own.length ? [`Your own:\n${own.join('\n')}`] : []),
    ...(general.length ? [`General:\n${general.join('\n')}`] : []),
  ].join('\n')
}

/** Reads an entry by name. The persona's own entry wins over a general one with the same name. */
export function readMemory(name: string, personaId: string): MemoryEntry | undefined {
  const key = normalizeMemoryName(name)
  const matches = visibleTo(personaId).filter(entry => entry.name === key)
  return matches.find(entry => entry.persona === personaId) ?? matches[0]
}

/** Creates or replaces an entry of the card by name. Returns the stored entry, or undefined for an empty name or body. */
export function writeMemory(
  input: Pick<MemoryEntry, 'name' | 'description' | 'body'>,
  personaId: string,
): MemoryEntry | undefined {
  const name = normalizeMemoryName(input.name)
  if (!name || !input.body.trim())
    return undefined

  const next: MemoryEntry = {
    name,
    description: input.description.trim(),
    body: input.body.trim(),
    persona: personaId,
    updatedAt: Date.now(),
  }

  replaceEntries([...entries.filter(existing => existing.name !== name || existing.persona !== personaId), next])
  return next
}

/** Makes a card's memory general, so every card reads it. A general memory with the same name gives way. */
export function makeGeneral(name: string, personaId: string) {
  const source = entries.find(existing => existing.name === name && existing.persona === personaId)
  if (!source?.persona)
    return

  const { persona: _card, ...general } = source
  replaceEntries([
    ...entries.filter(existing => existing !== source && (existing.name !== source.name || existing.persona)),
    { ...general, updatedAt: Date.now() },
  ])
}

/** Removes one entry, from a tool or from Settings. */
export function removeMemory(entry: Pick<MemoryEntry, 'name' | 'persona'>) {
  replaceEntries(entries.filter(existing => existing.name !== entry.name || existing.persona !== entry.persona))
}

/** Forgets an entry of the card by name. General memories belong to the owner, so a run cannot forget them. */
export function forgetMemory(name: string, personaId: string): boolean {
  const key = normalizeMemoryName(name)
  const target = entries.find(entry => entry.name === key && entry.persona === personaId)
  if (!target)
    return false

  removeMemory(target)
  return true
}

/**
 * The memory part of a run's prompt: how to use memory, and the index of the run's persona.
 *
 * The index changes only when an entry changes, so it stays in the cacheable prefix.
 */
export function composeMemoryPrompt(index: string): string {
  return [
    '',
    '',
    'Long-term memory. You keep it yourself. Each index line names one remembered fact, and states the fact or when it matters.',
    `Read entries with ${READ_MEMORY_TOOL_NAME} when they matter for your reply. An index line that already states the fact needs no read.`,
    `Save with ${WRITE_MEMORY_TOOL_NAME} only when someone asks you to remember something, or states a lasting fact. Most turns save nothing.`,
    'One fact per entry. Update an existing entry instead of adding a near copy. Never save what a recipe already holds, your own rules, codes, passwords, or secrets.',
    `Forget an entry with ${FORGET_MEMORY_TOOL_NAME} when it turns out wrong or someone asks. General entries belong to the owner, so you cannot change or forget them.`,
    index ? `Memory index:\n${index}` : 'The memory index is empty.',
  ].join('\n')
}

/** Reads the long-term memory state for Settings and chat. */
export function useMemoryState() {
  const memoryEnabled = useSyncExternalStore(subscribe, getMemoryEnabled, getMemoryEnabled)
  const memoryEntries = useSyncExternalStore(subscribe, getMemoryEntries, getMemoryEntries)
  return { enabled: memoryEnabled, entries: memoryEntries }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === memoryEnabledKey || event.key === memoryEntriesKey)
      reload()
  })
}
