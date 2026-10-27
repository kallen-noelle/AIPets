import type { AmbientProgram } from '@proj-airi/character-animation'

const hour = 3_600_000

export interface DefaultAmbientProgramOptions {
  characterId: string
  now: number
}

/**
 * The built-in ambient program, used when no stored program exists.
 *
 * One cycle lasts 24 hours. The phase offsets count from `now`, so the day
 * starts whenever the session ends. Entry clips are short actions. The hold is
 * a long action that keeps looping for the rest of the phase.
 */
export function createDefaultAmbientProgram(options: DefaultAmbientProgramOptions): AmbientProgram {
  return {
    programVersion: 1,
    programId: `${options.characterId}-ambient-default-${options.now}`,
    characterId: options.characterId,
    anchorAt: new Date(options.now).toISOString(),
    phases: [
      {
        durationMs: 4 * hour,
        clips: ['animations/晨间刷牙.webm', 'animations/吃早餐.webm'],
        holdLongAction: '悠闲哼歌',
      },
      {
        durationMs: 5 * hour,
        clips: ['animations/是啊，吃什么.webm', 'animations/涮火锅.webm'],
        holdLongAction: '放风筝',
      },
      {
        durationMs: 7 * hour,
        clips: ['animations/是啊，吃什么.webm', 'animations/吃晚餐.webm'],
        holdLongAction: '鲸鱼吐泡泡特效',
      },
      {
        durationMs: 8 * hour,
        clips: [],
        holdLongAction: '碎碎念-发呆碎碎念',
      },
    ],
  }
}
