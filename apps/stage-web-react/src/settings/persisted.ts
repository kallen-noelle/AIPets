import { useCallback, useEffect, useState } from 'react'

/**
 * Reads a value that Vue `useLocalStorage` may have written.
 *
 * Vue writes raw text for string, number, and boolean defaults, and JSON for
 * objects. A JSON parse covers both formats. A raw string that is not JSON
 * returns as is.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null)
      return fallback

    return JSON.parse(raw) as T
  }
  catch {
    return (localStorage.getItem(key) ?? fallback) as T
  }
}

/** Writes a string as raw text so Vue reads it back. Other values use JSON. */
export function writeStored<T>(key: string, value: T) {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
}

/**
 * Reads a Vue `useLocalStorage` compatible value and keeps windows in sync.
 */
export function useStoredValue<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))

  const update = useCallback((next: T) => {
    writeStored(key, next)
    setValue(next)
  }, [key])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key)
        setValue(readStored(key, fallback))
    }

    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [key, fallback])

  return [value, update] as const
}
