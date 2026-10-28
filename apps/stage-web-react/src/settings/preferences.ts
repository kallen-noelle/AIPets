import type { SupportedLanguage } from '../i18n'

import { useSyncExternalStore } from 'react'

import i18n, { languageStorageKey } from '../i18n'

export type ThemePreference = 'dark' | 'light'

const themeStorageKey = 'aipets:react:theme'

export interface Preferences {
  language: SupportedLanguage
  theme: ThemePreference
}

function readTheme(): ThemePreference {
  return localStorage.getItem(themeStorageKey) === 'light' ? 'light' : 'dark'
}

let state: Preferences = {
  language: i18n.language === 'en' ? 'en' : 'zh-Hans',
  theme: readTheme(),
}

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners)
    listener()
}

export function applyTheme(theme: ThemePreference) {
  document.documentElement.dataset.theme = theme
}

export function getPreferences(): Preferences {
  return state
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setLanguage(language: SupportedLanguage) {
  localStorage.setItem(languageStorageKey, language)
  void i18n.changeLanguage(language)
  state = { ...state, language }
  emit()
}

export function setTheme(theme: ThemePreference) {
  localStorage.setItem(themeStorageKey, theme)
  applyTheme(theme)
  state = { ...state, theme }
  emit()
}

export function initializePreferences() {
  applyTheme(state.theme)
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribePreferences, getPreferences, getPreferences)
}
