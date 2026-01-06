/**
 * Minimal OpenAI-compatible chat.completions client (no deps).
 *
 * Env:
 * - OPENAI_API_KEY
 * - OPENAI_MODEL (default: gpt-4o-mini)
 * - OPENAI_BASE_URL (default: https://api.openai.com/v1)
 */

export async function llmChat({
  system,
  user,
  temperature = 0.7,
  maxTokens = 120,
} = {}) {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  // IMPORTANT: do not start the path with "/" or URL() will drop the "/v1" part of baseUrl.
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const url = new URL('chat/completions', normalizedBase)

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...(user ? [{ role: 'user', content: user }] : []),
    ],
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`LLM error ${res.status}: ${JSON.stringify(json)}`)
  }

  const text = json?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string') {
    throw new Error(`LLM returned no text: ${JSON.stringify(json)}`)
  }

  return text.trim()
}


