import type { Recipe } from '../../recipes/store'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, TextField, ToggleField } from '../../components/fields'
import {
  addRecipe,
  approveRecipe,
  removeRecipe,
  setProposalsEnabled,
  setRecipeEnabled,
  useRecipes,
} from '../../recipes/store'

const fieldClass = [
  'w-full rounded-xl border border-[var(--aipets-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--aipets-fg)]',
].join(' ')

/** Shows one recipe with the switch, the approval, and the owner's controls. */
function RecipeItem({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation()

  return (
    <li className="flex flex-col gap-2 border border-[var(--aipets-border)] rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1">
          <span className="text-sm font-medium">{recipe.name}</span>
          <span className="text-xs text-[var(--aipets-muted)]">{recipe.description}</span>
          <span className="text-[10px] text-[var(--aipets-muted)]">
            {recipe.source === 'user'
              ? t('settings.pages.modules.memory-long-term.recipes.sources.user', { defaultValue: 'Yours' })
              : t('settings.pages.modules.memory-long-term.recipes.sources.model', {
                  defaultValue: 'Proposed by the character',
                })}
          </span>
        </div>

        <button
          type="button"
          className="shrink-0 text-xs text-[var(--aipets-muted)] hover:text-rose-400"
          onClick={() => removeRecipe(recipe.id)}
        >
          {t('settings.pages.modules.memory-long-term.recipes.remove', { defaultValue: 'Remove' })}
        </button>
      </div>

      {recipe.keywords.length > 0 && (
        <span className="text-xs text-[var(--aipets-muted)]">
          {t('settings.pages.modules.memory-long-term.recipes.keywords_summary', {
            defaultValue: 'Code words: {{words}}',
            words: recipe.keywords.join(', '),
          })}
        </span>
      )}

      {recipe.background && (
        <span className="self-start border border-[var(--aipets-border)] rounded-full px-2 py-0.5 text-[10px]">
          {t('settings.pages.modules.memory-long-term.recipes.background.tag', { defaultValue: 'Background' })}
        </span>
      )}

      {!recipe.approved && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-amber-400">
            {t('settings.pages.modules.memory-long-term.recipes.pending', {
              defaultValue: 'Waits for your approval. After one approval, it never asks again.',
            })}
          </span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => approveRecipe(recipe.id)}
          >
            {t('settings.pages.modules.memory-long-term.recipes.approve', { defaultValue: 'Approve' })}
          </button>
        </div>
      )}

      <ToggleField
        label={t('settings.pages.modules.memory-long-term.recipes.enabled', {
          defaultValue: 'Use {{name}}',
          name: recipe.name,
        })}
        checked={recipe.enabled}
        disabled={!recipe.approved}
        onChange={value => setRecipeEnabled(recipe.id, value)}
      />
    </li>
  )
}

/**
 * Recipes the owner keeps, and the proposals that wait for approval.
 *
 * The chat reads the same list through the shared `recipes/custom` key.
 */
export function RecipesPage() {
  const { t } = useTranslation()
  const { recipes, proposalsEnabled } = useRecipes()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [keywords, setKeywords] = useState('')
  const [background, setBackground] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const add = () => {
    if (!name.trim() || !instructions.trim()) {
      setFormError(t('settings.reactShell.recipesFormIncomplete', {
        defaultValue: 'A recipe needs a name and instructions.',
      }))
      return
    }

    addRecipe({
      name,
      description,
      instructions,
      keywords: keywords.split(','),
      background,
    })
    setFormError(null)
    setName('')
    setDescription('')
    setInstructions('')
    setKeywords('')
    setBackground(false)
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.memory-long-term.recipes.title', { defaultValue: 'Recipes' })}
        description={t('settings.pages.modules.memory-long-term.recipes.entry.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.memory-long-term.recipes.proposals.label', {
            defaultValue: 'Let the character propose recipes',
          })}
          description={t('settings.pages.modules.memory-long-term.recipes.proposals.description', { defaultValue: '' })}
          checked={proposalsEnabled}
          onChange={setProposalsEnabled}
        />
      </SectionCard>

      <SectionCard title={t('settings.pages.modules.memory-long-term.recipes.add_button', { defaultValue: 'Add recipe' })}>
        <TextField
          label={t('settings.pages.modules.memory-long-term.recipes.add.name', { defaultValue: 'Name' })}
          value={name}
          onChange={setName}
        />
        <TextField
          label={t('settings.pages.modules.memory-long-term.recipes.add.description', {
            defaultValue: 'When to use it',
          })}
          value={description}
          onChange={setDescription}
        />
        <TextField
          label={t('settings.pages.modules.memory-long-term.recipes.add.keywords.label', { defaultValue: 'Code words' })}
          description={t('settings.pages.modules.memory-long-term.recipes.add.keywords.description', { defaultValue: '' })}
          value={keywords}
          placeholder="plan-trip, remind-me"
          onChange={setKeywords}
        />

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.pages.modules.memory-long-term.recipes.add.instructions', { defaultValue: 'What to do' })}</span>
          <textarea
            className={`${fieldClass} min-h-24`}
            value={instructions}
            onChange={event => setInstructions(event.target.value)}
          />
        </label>

        <ToggleField
          label={t('settings.pages.modules.memory-long-term.recipes.background.label', {
            defaultValue: 'Run in the background',
          })}
          description={t('settings.pages.modules.memory-long-term.recipes.background.description', { defaultValue: '' })}
          checked={background}
          onChange={setBackground}
        />

        {formError && <p className="text-xs text-rose-400">{formError}</p>}

        <button
          type="button"
          onClick={add}
          className="self-start rounded-full bg-[var(--aipets-fg)] px-4 py-1.5 text-xs text-[var(--aipets-bg)] font-medium"
        >
          {t('settings.pages.modules.memory-long-term.recipes.add.submit', { defaultValue: 'Add' })}
        </button>
      </SectionCard>

      <SectionCard title={t('settings.pages.modules.memory-long-term.recipes.entry.title', { defaultValue: 'Recipes' })}>
        {recipes.length === 0
          ? (
              <p className="text-xs text-[var(--aipets-muted)]">
                {t('settings.pages.modules.memory-long-term.recipes.empty', { defaultValue: 'No recipes yet.' })}
              </p>
            )
          : (
              <ul className="flex flex-col gap-2">
                {recipes.map(recipe => <RecipeItem key={recipe.id} recipe={recipe} />)}
              </ul>
            )}
      </SectionCard>
    </section>
  )
}
