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
  const tokenLimit = options.maxTokens || 4000;
  const payload = {
    messages,
    model: options.model || 'gpt-5.6-luna',
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
    response_format: options.responseFormat || null,
    max_tokens: tokenLimit,
    max_completion_tokens: tokenLimit
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
  const choice = data.choices?.[0];
  let content = choice?.message?.content ?? choice?.text;
  
  // If content is null but reasoning_content exists or choice had finish_reason length, check if we can retry
  if (!content) {
    if (choice?.message?.refusal) {
      throw new Error(`LLM Model Refusal: ${choice.message.refusal}`);
    }
    if (data.error?.message) {
      throw new Error(`LLM Error: ${data.error.message}`);
    }

    // Auto-retry once with doubled token headroom if finish_reason was length
    if (choice?.finish_reason === 'length' && (options.maxTokens || 4000) < 12000) {
      console.warn('LLM finish_reason was length, auto-retrying with expanded token headroom...');
      return callLlmProxy(messages, {
        ...options,
        maxTokens: Math.min(16000, (options.maxTokens || 4000) * 2)
      });
    }

    throw new Error(`LLM response contained no message content (finish_reason: ${choice?.finish_reason || 'unknown'}).`);
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
