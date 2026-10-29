import type { AffectState } from '@proj-aipets/character-animation'

/** One factual line in a state section. */
export interface StateEntry {
  label: string
  value: string
}

/** Facts the prompts show for one turn. */
export interface StateContext {
  affect: AffectState | null
  /** Clips the character just played, newest first. */
  recentClipIds: string[]
  now: Date
}

/**
 * Supplies state entries. Register a provider to extend the state prompt.
 *
 * A provider returns facts only. How the facts change tone or action stays a
 * model decision, so new state never needs decision logic in the host.
 */
export type StateProvider = (context: StateContext) => StateEntry | StateEntry[] | undefined

const worldProviders = new Set<StateProvider>()
const characterProviders = new Set<StateProvider>()

export function registerWorldStateProvider(provider: StateProvider): () => void {
  worldProviders.add(provider)
  return () => {
    worldProviders.delete(provider)
  }
}

export function registerCharacterStateProvider(provider: StateProvider): () => void {
  characterProviders.add(provider)
  return () => {
    characterProviders.delete(provider)
  }
}

function entriesOf(result: StateEntry | StateEntry[] | undefined): StateEntry[] {
  if (!result)
    return []
  return Array.isArray(result) ? result : [result]
}

function collect(providers: Set<StateProvider>, context: StateContext): StateEntry[] {
  return [...providers].flatMap(provider => entriesOf(provider(context)))
}

/** Turns a clip id into the bare name the prompt shows. */
function clipLabel(id: string): string {
  const file = id.split('/').pop() ?? id
  return file.replace(/\.webm$/i, '')
}

registerWorldStateProvider(context => ({
  label: '当前时间',
  value: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeStyle: 'short' }).format(context.now),
}))

registerCharacterStateProvider((context) => {
  if (!context.affect)
    return []

  const { valence, arousal, label, affinity } = context.affect
  return [
    { label: '情绪效价', value: valence.toFixed(2) },
    { label: '情绪唤醒', value: arousal.toFixed(2) },
    { label: '情绪标签', value: label },
    { label: '好感度', value: String(affinity) },
    ...(context.recentClipIds.length
      ? [{ label: '最近已播', value: context.recentClipIds.map(clipLabel).join('、') }]
      : []),
  ]
})

function buildSection(title: string, entries: StateEntry[]): string[] {
  if (!entries.length)
    return []
  return [title, ...entries.map(entry => `- ${entry.label}：${entry.value}`)]
}

/**
 * Builds the state block shown to the chat and director prompts.
 *
 * The block carries facts only. The header tells the model to decide the
 * effect, so adding state needs one provider and no decision logic.
 */
export function buildStatePrompt(context: StateContext): string {
  const world = collect(worldProviders, context)
  const character = collect(characterProviders, context)

  return [
    '下面是当前事实。它们如何影响本轮回复的语气、情绪变化与动作，由你判断。',
    '',
    ...buildSection('世界状态：', world),
    ...buildSection('角色状态：', character),
  ].join('\n').trim()
}
