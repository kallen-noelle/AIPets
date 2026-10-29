import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

import { ensureDefaultInstance, useCharacterInstances } from '../character/instances'
import { receivePetRelay } from '../desktop/pet-relay'
import { StagePage } from './stage-page'

/**
 * The desktop pet window. It shows one instance of a character, and replays
 * the animation signals the chat window forwards.
 *
 * The main process opens one window per instance and passes its id in the
 * route. A window without an id is the startup window, which shows the first
 * instance until the host assigns an id to it.
 */
export function PetPage() {
  const [searchParams] = useSearchParams()
  const instanceId = searchParams.get('instance')
  const [instances] = useCharacterInstances()
  const instance = instanceId
    ? instances.find(entry => entry.id === instanceId) ?? null
    : instances[0] ?? null

  useEffect(() => {
    void ensureDefaultInstance()
  }, [])

  useEffect(() => receivePetRelay(), [])

  return <StagePage layout="pet" instance={instance} />
}
