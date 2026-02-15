interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof TypeError;
}

function parseRetryAfterMs(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const parsedMs = Date.parse(retryAfter);
  if (Number.isFinite(parsedMs)) {
    return Math.max(0, parsedMs - Date.now());
  }

  return null;
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS
  }: FetchRetryOptions = {}
): Promise<Response> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });

      if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers);
      const exponentialDelayMs = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterMs = Math.round(Math.random() * 100);
      await sleep(retryAfterMs ?? exponentialDelayMs + jitterMs);
    } catch (error) {
      if (!isRetryableError(error) || attempt >= maxAttempts) {
        throw error;
      }

      const exponentialDelayMs = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterMs = Math.round(Math.random() * 100);
      await sleep(exponentialDelayMs + jitterMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
