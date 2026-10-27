export enum Emotion {
  Happy = 'happy',
  Sad = 'sad',
  Angry = 'angry',
  Think = 'think',
  Surprise = 'surprised',
  Awkward = 'awkward',
  Question = 'question',
  Curious = 'curious',
  Neutral = 'neutral',
}

export const EMOTION_VALUES = Object.values(Emotion)

export const EmotionHappyMotionName = 'Happy'
export const EmotionSadMotionName = 'Sad'
export const EmotionAngryMotionName = 'Angry'
export const EmotionAwkwardMotionName = 'Awkward'
export const EmotionThinkMotionName = 'Think'
export const EmotionSurpriseMotionName = 'Surprise'
export const EmotionQuestionMotionName = 'Question'
export const EmotionNeutralMotionName = 'Idle'
export const EmotionCuriousMotionName = 'Curious'

export const EMOTION_EmotionMotionName_value = {
  [Emotion.Happy]: EmotionHappyMotionName,
  [Emotion.Sad]: EmotionSadMotionName,
  [Emotion.Angry]: EmotionAngryMotionName,
  [Emotion.Think]: EmotionThinkMotionName,
  [Emotion.Surprise]: EmotionSurpriseMotionName,
  [Emotion.Awkward]: EmotionAwkwardMotionName,
  [Emotion.Question]: EmotionQuestionMotionName,
  [Emotion.Neutral]: EmotionNeutralMotionName,
  [Emotion.Curious]: EmotionCuriousMotionName,
}

export interface EmotionPayload {
  name: Emotion
  intensity: number
}
