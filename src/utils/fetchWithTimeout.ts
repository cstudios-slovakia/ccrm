// fetch() wrapper that aborts after `timeoutMs` so long-running requests
// (AI summarize / transcribe / report generation) cannot leave the UI spinning
// forever when the backend stalls. On timeout the returned promise rejects with
// an AbortError, which callers already handle in their catch/error branches.
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 120000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
