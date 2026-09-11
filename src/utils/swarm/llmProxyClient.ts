/**
 * LLM Proxy Client
 * Routes chat completion requests through the secure authenticated PHP proxy (/api/swarm.php?action=llm_proxy).
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  responseFormat?: { type: 'json_object' } | null;
  maxTokens?: number;
}

export async function callLlmProxy(
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<string> {
  const payload = {
    messages,
    model: options.model || 'gpt-4o-mini',
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
    response_format: options.responseFormat || null,
    max_tokens: options.maxTokens || 1500
  };

  const response = await fetch('api/swarm.php?action=llm_proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedMsg = `LLM Proxy HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(errorBody);
      if (errJson.message) parsedMsg += `: ${errJson.message}`;
      if (errJson.error?.message) parsedMsg += `: ${errJson.error.message}`;
    } catch {
      parsedMsg += `: ${errorBody.slice(0, 150)}`;
    }
    throw new Error(parsedMsg);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM response contained no message content.');
  }

  return content;
}

/**
 * Helper to call LLM and safely parse JSON response.
 */
export async function callLlmJson<T>(
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<T> {
  const rawText = await callLlmProxy(messages, {
    ...options,
    responseFormat: { type: 'json_object' }
  });

  try {
    return JSON.parse(rawText) as T;
  } catch (err) {
    // If json_object returned wrapped markdown ```json ... ```
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      return JSON.parse(match[1]) as T;
    }
    throw new Error(`Failed to parse LLM JSON output: ${(err as Error).message}\nRaw: ${rawText.slice(0, 200)}`);
  }
}
