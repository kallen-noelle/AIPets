/**
 * Audio transcription through an omni chat model.
 *
 * DashScope has no `/audio/transcriptions`, but `qwen3-omni` and
 * `qwen3.8-omni-flash` accept `input_audio` in a chat message. The model reads
 * the clip and returns the transcript as text.
 */

export interface OmniTranscriptionOptions {
  baseUrl: string
  apiKey: string
  model: string
}

export async function transcribeWithOmni(
  base64Wav: string,
  options: OmniTranscriptionOptions,
): Promise<string> {
  const response = await fetch(`${options.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'qwen3.8-omni-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a transcription engine. Return only the transcript of the audio, in the language of the speaker, with no extra words, punctuation changes, or commentary.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: `data:audio/wav;base64,${base64Wav}` },
            },
          ],
        },
      ],
      stream: false,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Transcription failed with HTTP ${response.status}`)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = payload.choices?.[0]?.message?.content

  if (typeof content !== 'string' || !content.trim())
    throw new Error('The omni model returned no transcript')

  return content.trim()
}
