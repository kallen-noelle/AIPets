import type { InferenceServiceProvider } from '@proj-airi/provider-inference'

import { useSyncExternalStore } from 'react'

/** Same keys as the Vue `provider-config` store, so both apps share state. */
const configuredKey = 'settings/providers/configured'

export type ProviderMap = Record<string, InferenceServiceProvider>

function readProviders(): ProviderMap {
  try {
    const raw = localStorage.getItem(configuredKey)
    return raw ? JSON.parse(raw) as ProviderMap : {}
  }
  catch {
    return {}
  }
}

let providers: ProviderMap = readProviders()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners)
    listener()
}

function persist(next: ProviderMap) {
  providers = next
  localStorage.setItem(configuredKey, JSON.stringify(next))
  emit()
}

export function getProviders(): ProviderMap {
  return providers
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useProviders(): ProviderMap {
  return useSyncExternalStore(subscribe, getProviders, getProviders)
}

export function createProvider(definitionId: string): InferenceServiceProvider {
  const provider: InferenceServiceProvider = {
    id: crypto.randomUUID(),
    definitionId,
    config: {},
    status: 'unconfigured',
    configuredBy: 'user',
  }

  persist({ ...providers, [provider.id]: provider })
  return provider
}

export function updateProviderConfig(
  providerId: string,
  config: Record<string, unknown>,
  status: InferenceServiceProvider['status'] = 'unconfigured',
) {
  const current = providers[providerId]
  if (!current)
    return

  persist({
    ...providers,
    [providerId]: { ...current, config, status },
  })
}

export function resetProviders() {
  persist({})
}

export function removeProvider(providerId: string) {
  if (!providers[providerId])
    return

  const next = { ...providers }
  delete next[providerId]
  persist(next)
}

/** Keeps other windows in sync, which the Vue store delegated to its sync plugin. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== configuredKey)
      return

    providers = readProviders()
    emit()
  })
}
