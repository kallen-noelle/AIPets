import { useSyncExternalStore } from 'react'

import { readStored, writeStored } from '../settings/persisted'

/** A yes-or-no question, or one choice from named options. */
export type DecisionQuestion
  = | { type: 'noul', instructions: string, criteria: { true: string, false: string } }
    | { type: 'choice', instructions: string, criteria: Record<string, string> }

/** What one answer of a decision does. */
export type DecisionAction
  = | { kind: 'stay-quiet' }
    | { kind: 'hint', text: string }
    | { kind: 'recipe', recipeId: string }

export interface RecipeDecision {
  question: DecisionQuestion
  actions: Record<string, DecisionAction>
}

/**
 * One recipe, shaped like the Vue `recipes/custom` entry.
 *
 * Mirrors `Recipe` in `@proj-airi/core-agent`. The React app keeps its own
 * type so it does not add the agent runtime as a dependency.
 */
export interface Recipe {
  id: string
  name: string
  description: string
  instructions: string
  decision?: RecipeDecision
  keywords: string[]
  source: 'user' | 'model'
  enabled: boolean
  approved: boolean
  background?: boolean
}

export interface RecipeFields {
  name: string
  description: string
  instructions: string
  keywords: string[]
  background: boolean
}

/** Same keys as the Vue recipes store, so both apps read one list. */
export const recipesKey = 'recipes/custom'
export const proposalsEnabledKey = 'recipes/proposals-enabled'

function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== 'object' || value === null)
    return false

  const entry = value as Partial<Recipe>
  return typeof entry.id === 'string'
    && typeof entry.name === 'string'
    && Array.isArray(entry.keywords)
    && typeof entry.enabled === 'boolean'
    && typeof entry.approved === 'boolean'
}

function readRecipes(): Recipe[] {
  const stored = readStored<unknown>(recipesKey, [])
  return Array.isArray(stored) ? stored.filter(isRecipe) : []
}

let recipes: Recipe[] = readRecipes()
let proposalsEnabled: boolean = readStored(proposalsEnabledKey, true)

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

function replace(next: Recipe[]) {
  recipes = next
  writeStored(recipesKey, next)
  emit()
}

export function getRecipes(): Recipe[] {
  return recipes
}

export function getProposalsEnabled(): boolean {
  return proposalsEnabled
}

/** Enables or disables one recipe. An unapproved model proposal stays unusable. */
export function setRecipeEnabled(id: string, enabled: boolean) {
  replace(recipes.map(recipe => recipe.id === id ? { ...recipe, enabled } : recipe))
}

/** The owner authorizes a model proposal once. Later uses need no approval. */
export function approveRecipe(id: string) {
  replace(recipes.map(recipe => recipe.id === id ? { ...recipe, approved: true, enabled: true } : recipe))
}

/** Adds an owner recipe. The owner wrote it, so it starts approved and enabled. */
export function addRecipe(fields: RecipeFields) {
  const recipe: Recipe = {
    id: `user:${crypto.randomUUID()}`,
    name: fields.name.trim(),
    description: fields.description.trim(),
    instructions: fields.instructions.trim(),
    keywords: fields.keywords.map(word => word.trim()).filter(Boolean),
    source: 'user',
    enabled: true,
    approved: true,
    background: fields.background,
  }

  replace([...recipes, recipe])
}

export function removeRecipe(id: string) {
  replace(recipes.filter(recipe => recipe.id !== id))
}

export function setProposalsEnabled(value: boolean) {
  proposalsEnabled = value
  writeStored(proposalsEnabledKey, value)
  emit()
}

/** Reads the recipe list for Settings. */
export function useRecipes() {
  const list = useSyncExternalStore(subscribe, getRecipes, getRecipes)
  const proposals = useSyncExternalStore(subscribe, getProposalsEnabled, getProposalsEnabled)
  return { recipes: list, proposalsEnabled: proposals }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === recipesKey)
      recipes = readRecipes()
    else if (event.key === proposalsEnabledKey)
      proposalsEnabled = readStored(proposalsEnabledKey, true)
    else
      return

    emit()
  })
}
