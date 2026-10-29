import type {
  AffectBaseline,
  AffectEventKind,
  AffectState,
  CharacterTraits,
} from '@proj-aipets/character-animation'

import {
  affectLimits,
  applyAffectDelta,
  applyAffectEvent,
  createAffectState,
  decayAffect,
  defaultCharacterTraits,
  parseAffectState,
} from '@proj-aipets/character-animation'
import { useEffect, useState } from 'react'

import { readStored, writeStored } from '../settings/persisted'
import { getActiveCharacterId } from './characters'

export interface AffectSnapshot {
  characterId: string | null
  state: AffectState | null
}

export interface AffectProfile {
  baseline: AffectBaseline
  traits: CharacterTraits
}

const affectRefreshMs = 5 * 60 * 1000

// Persona values decide how strongly an event moves affect. They stay in the
// host because they are presentation choices, not animation protocol.
const profiles: Record<string, AffectProfile> = {
  main: {
    baseline: { valence: 0.2, arousal: 0.45 },
    traits: { sensitivity: 1.1, shyness: 0.75, pride: 0.2, expressiveness: 1.1 },
  },
  character2: {
    baseline: { valence: 0.1, arousal: 0.5 },
    traits: { sensitivity: 0.9, shyness: 0.25, pride: 0.9, expressiveness: 1 },
  },
  character3: {
    baseline: { valence: 0.15, arousal: 0.55 },
    traits: { sensitivity: 1.2, shyness: 0.2, pride: 0.4, expressiveness: 1.2 },
  },
  character4: {
    baseline: { valence: 0.18, arousal: 0.4 },
    traits: { sensitivity: 1, shyness: 0.45, pride: 0.35, expressiveness: 0.9 },
  },
  character5: {
    baseline: { valence: 0.1, arousal: 0.5 },
    traits: { sensitivity: 1.25, shyness: 0.55, pride: 0.6, expressiveness: 1 },
  },
}

const fallbackProfile: AffectProfile = {
  baseline: { valence: 0.1, arousal: 0.45 },
  traits: defaultCharacterTraits,
}

function profileFor(characterId: string): AffectProfile {
  return profiles[characterId] ?? fallbackProfile
}

function storageKey(characterId: string): string {
  return `aipets:react:character/${characterId}/affect`
}

const praisePattern = /可爱|好棒|真棒|厉害|喜欢你|爱你|辛苦|谢谢|聪明|漂亮|好看|最棒|优秀|乖/
const insultPattern = /[笨傻蠢]|废物|讨厌|难看|没用|垃圾|闭嘴/
const negatedInsultPattern = /不[笨傻蠢]|不讨厌|不难看|不没用/
const apologyPattern = /对不起|抱歉|不好意思|原谅/

/**
 * Classifies one user message into a local affect rule.
 *
 * This is a deliberately small lexicon. It provides instant, offline reactions
 * before any model call. The director can refine the result later.
 *
 * @example
 * classifyAffectText('你今天真可爱')
 * // => 'praise'
 */
export function classifyAffectText(text: string): AffectEventKind | null {
  const trimmed = text.trim()
  if (!trimmed)
    return null

  if (apologyPattern.test(trimmed))
    return 'apology'

  if (insultPattern.test(trimmed) && !negatedInsultPattern.test(trimmed))
    return 'insult'

  if (praisePattern.test(trimmed))
    return 'praise'

  return null
}

class CharacterAffectStore {
  private characterId: string | null = null
  private state: AffectState | null = null
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null

  get snapshot(): AffectSnapshot {
    return { characterId: this.characterId, state: this.state }
  }

  setCharacter(characterId: string): void {
    if (!characterId)
      return

    if (this.characterId === characterId) {
      this.refresh()
      return
    }

    this.characterId = characterId
    this.state = this.load(characterId)
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    if (!this.timer)
      this.timer = setInterval(() => this.refresh(), affectRefreshMs)

    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size && this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }

  applyEvent(kind: AffectEventKind): void {
    if (!this.state || !this.characterId)
      return

    const profile = profileFor(this.characterId)
    this.state = applyAffectEvent(this.state, kind, profile.traits, { now: Date.now() })
    this.persist()
    this.notify()
  }

  /**
   * Applies a bounded director proposal. The store clamps the delta to the
   * director cap, so a model response cannot override rule-owned state.
   */
  applyDelta(delta: { valence: number, arousal: number }): void {
    if (!this.state || !this.characterId)
      return

    const profile = profileFor(this.characterId)
    this.state = applyAffectDelta(this.state, delta, profile.traits, {
      now: Date.now(),
      maxValenceDelta: affectLimits.maxDirectorValence,
      maxArousalDelta: affectLimits.maxDirectorArousal,
    })
    this.persist()
    this.notify()
  }

  refresh(): void {
    if (!this.state || !this.characterId)
      return

    const profile = profileFor(this.characterId)
    const next = decayAffect(this.state, {
      now: Date.now(),
      baseline: profile.baseline,
      traits: profile.traits,
    })
    if (next === this.state)
      return

    this.state = next
    this.persist()
    this.notify()
  }

  reset(): void {
    if (!this.characterId)
      return

    const profile = profileFor(this.characterId)
    this.state = createAffectState({
      characterId: this.characterId,
      baseline: profile.baseline,
      traits: profile.traits,
      now: Date.now(),
    })
    this.persist()
    this.notify()
  }

  private load(characterId: string): AffectState {
    const profile = profileFor(characterId)
    const raw = readStored<unknown>(storageKey(characterId), null)
    if (raw) {
      const parsed = parseAffectState(raw)
      if (parsed.ok && parsed.state.characterId === characterId) {
        return decayAffect(parsed.state, {
          now: Date.now(),
          baseline: profile.baseline,
          traits: profile.traits,
        })
      }
    }

    return createAffectState({
      characterId,
      baseline: profile.baseline,
      traits: profile.traits,
      now: Date.now(),
    })
  }

  private persist(): void {
    if (this.state)
      writeStored(storageKey(this.state.characterId), this.state)
  }

  private notify(): void {
    for (const listener of this.listeners)
      listener()
  }
}

export const affectStore = new CharacterAffectStore()

/**
 * Applies a chat turn to the active character. Strong praise, insults, and
 * apologies use their rule delta. Every other turn uses the small conversation
 * affinity update.
 */
export function applyUserMessageAffect(text: string): void {
  // The stage may show an imported pack whose manifest id is not in the
  // built-in registry. Prefer the character already selected by the stage.
  if (!affectStore.snapshot.characterId)
    affectStore.setCharacter(getActiveCharacterId() ?? 'main')

  affectStore.applyEvent(classifyAffectText(text) ?? 'conversation')
}

/**
 * Subscribes a component to the affect state for one character.
 *
 * The store loads persisted state and catches up decay on mount. A missing
 * character leaves the previous snapshot untouched until the stage resolves
 * which character is active.
 */
export function useAffect(characterId: string | null): AffectSnapshot {
  const [snapshot, setSnapshot] = useState<AffectSnapshot>(() => affectStore.snapshot)

  useEffect(() => {
    if (characterId)
      affectStore.setCharacter(characterId)

    const unsubscribe = affectStore.subscribe(() => setSnapshot(affectStore.snapshot))
    setSnapshot(affectStore.snapshot)
    return unsubscribe
  }, [characterId])

  return snapshot
}
