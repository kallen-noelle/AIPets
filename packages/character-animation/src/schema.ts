import * as v from 'valibot'

const clipObjectSchema = v.object({
  src: v.pipe(v.string(), v.minLength(1)),
  weight: v.optional(v.pipe(v.number(), v.minValue(0)), 1),
  loop: v.optional(v.boolean(), true),
  fadeMs: v.optional(v.pipe(v.number(), v.minValue(0))),
  /** Known clip length. Long actions need it on the mid clip to count repeats. */
  durationMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

const clipEntrySchema = v.union([v.string(), clipObjectSchema])

const clipListSchema = v.pipe(v.array(clipEntrySchema), v.minLength(1))

const emotionEntrySchema = v.union([
  clipListSchema,
  v.object({
    low: v.optional(clipListSchema),
    high: v.optional(clipListSchema),
  }),
])

const clickEntrySchema = v.union([
  clipListSchema,
  v.object({
    head: v.optional(clipListSchema),
    body: v.optional(clipListSchema),
    default: v.optional(clipListSchema),
  }),
])

const lookEntrySchema = v.object({
  left: v.optional(clipEntrySchema),
  right: v.optional(clipEntrySchema),
})

const longActionEntrySchema = v.object({
  /** Entry clip. Omit it to start directly with the mid clip. */
  start: v.optional(clipEntrySchema),
  /** Loop body. Its `durationMs` decides how many repeats fill the request. */
  mid: clipEntrySchema,
  /** Exit clip. Omit it to return to the base chain after the last mid repeat. */
  end: v.optional(clipEntrySchema),
  /** Duration used when the caller does not pass one. Defaults to one mid clip. */
  defaultDurationMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

export const manifestSchema = v.object({
  manifestVersion: v.literal(1),
  id: v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]*$/, 'id must use lowercase letters, digits and dashes')),
  name: v.pipe(v.string(), v.minLength(1)),
  canvas: v.object({
    width: v.pipe(v.number(), v.integer(), v.minValue(1)),
    height: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  preview: v.optional(v.string()),
  anchor: v.optional(v.object({
    x: v.number(),
    y: v.number(),
  })),
  animations: v.object({
    idle: clipListSchema,
    talk: v.optional(clipListSchema),
    thinking: v.optional(clipListSchema),
    /** Session wait loop. Falls back to idle when the pack has no clips. */
    waiting: v.optional(clipListSchema),
    click: v.optional(clickEntrySchema),
    emotion: v.optional(v.record(v.string(), emotionEntrySchema)),
    actions: v.optional(v.record(v.string(), clipEntrySchema)),
    longActions: v.optional(v.record(v.string(), longActionEntrySchema)),
    expressions: v.optional(v.record(v.string(), clipEntrySchema)),
    beat: v.optional(clipListSchema),
    look: v.optional(lookEntrySchema),
  }),
  transition: v.optional(v.object({
    fadeMs: v.optional(v.pipe(v.number(), v.minValue(0)), 180),
  })),
  audio: v.optional(v.picklist(['keep', 'mute']), 'keep'),
})

export type AnimationManifest = v.InferOutput<typeof manifestSchema>
export type RawClipEntry = v.InferOutput<typeof clipEntrySchema>
export type RawEmotionEntry = v.InferOutput<typeof emotionEntrySchema>
export type RawClickEntry = v.InferOutput<typeof clickEntrySchema>
export type RawLongActionEntry = v.InferOutput<typeof longActionEntrySchema>
