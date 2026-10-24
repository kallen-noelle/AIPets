import * as v from 'valibot'

const clipObjectSchema = v.object({
  src: v.pipe(v.string(), v.minLength(1)),
  weight: v.optional(v.pipe(v.number(), v.minValue(0)), 1),
  loop: v.optional(v.boolean(), true),
  fadeMs: v.optional(v.pipe(v.number(), v.minValue(0))),
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
    click: v.optional(clickEntrySchema),
    emotion: v.optional(v.record(v.string(), emotionEntrySchema)),
    actions: v.optional(v.record(v.string(), clipEntrySchema)),
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
