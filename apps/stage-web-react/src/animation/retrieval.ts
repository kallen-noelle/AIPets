import type { AffectLabel, AffectState, CharacterCatalog, ClipDescriptor } from '@proj-airi/character-animation'

const labelTags: Record<AffectLabel, string[]> = {
  excited: ['excited', 'happy', 'play'],
  content: ['happy', 'ambient', 'play'],
  calm: ['ambient', 'look'],
  shy: ['shy', 'happy'],
  proud: ['proud', 'vanity'],
  sad: ['sad', 'comfort'],
  angry: ['angry'],
  sleepy: ['sleepy', 'rest'],
}

const keywordRules = [
  { tags: ['shy', 'happy'], keywords: ['害羞', '可爱', '脸红', '夸'] },
  { tags: ['happy', 'excited'], keywords: ['开心', '高兴', '好棒', '喜欢', '爱你', '谢谢'] },
  { tags: ['angry'], keywords: ['生气', '讨厌', '笨', '傻', '滚', '闭嘴'] },
  { tags: ['sad', 'comfort'], keywords: ['难过', '伤心', '失望', '对不起', '抱歉'] },
  { tags: ['sleepy'], keywords: ['困', '累', '睡', '晚安', '休息'] },
  { tags: ['thinking', 'work'], keywords: ['代码', '报错', '工作', '学习', '写', '思考'] },
  { tags: ['food'], keywords: ['吃', '饿', '饭', '零食', '好吃'] },
  { tags: ['play'], keywords: ['玩', '游戏', '陪', '一起', '有趣'] },
  { tags: ['perform', 'vanity', 'magic'], keywords: ['变装', '换装', '变身', '造型', '化妆', 'cos'] },
  { tags: ['perform'], keywords: ['跳舞', '舞蹈', '表演', '唱歌', '转圈'] },
  { tags: ['polite', 'happy'], keywords: ['你好', '早安', '欢迎', '辛苦了'] },
]

function queryTagsFor(affect: AffectState, query: string): string[] {
  const tags = new Set<string>(labelTags[affect.label])
  for (const rule of keywordRules) {
    if (rule.keywords.some(keyword => query.includes(keyword))) {
      for (const tag of rule.tags)
        tags.add(tag)
    }
  }
  return [...tags]
}

/**
 * Ranks clips for the director prompt.
 *
 * The director sees a short, relevant shortlist instead of the full catalog.
 * Tag overlap dominates. Valence and arousal distance break ties, and one-shot
 * clips outrank loops because the plan schedules one-shots.
 */
export function retrieveCandidates(
  catalog: CharacterCatalog,
  affect: AffectState,
  query: string,
  limit = 20,
): ClipDescriptor[] {
  const tags = queryTagsFor(affect, query)

  const ranked = catalog.clips.map((clip) => {
    let score = 0
    for (const tag of tags) {
      if (clip.tags.includes(tag))
        score += 2
    }

    score += clip.role === 'oneShot' ? 0.4 : -0.2
    score += 1 - Math.abs(clip.valence - affect.valence) / 2
    score += 1 - Math.abs(clip.arousal - affect.arousal)

    return { clip, score }
  })

  ranked.sort((left, right) => right.score - left.score || left.clip.id.localeCompare(right.clip.id))
  return ranked.slice(0, Math.max(1, limit)).map(entry => entry.clip)
}
