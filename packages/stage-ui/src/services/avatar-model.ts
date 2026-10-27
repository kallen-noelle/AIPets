import type { CharacterAvatarModelReference } from '../types/avatar-model'

import { nanoid } from 'nanoid'

/** Creates a Character reference for a stored Display Model. */
export function createAvatarModelReference(displayModelId: string): CharacterAvatarModelReference {
  return { id: nanoid(), displayModelId, type: 'animation', config: {} }
}
