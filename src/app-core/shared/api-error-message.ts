export interface ApiErrorEnvelope {
  status: number;
  code: string | null;
  message: string;
}

export function isApiRequestAborted(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

export function isApiNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

export function normalizeApiErrorEnvelope(
  body: unknown,
  status: number,
  fallbackMessage: string
): ApiErrorEnvelope {
  let code: string | null = null;
  let message = "";
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const rawCode = typeof record.code === "string" ? record.code.trim() : "";
    code = rawCode || null;
    const error = typeof record.error === "string" ? record.error.trim() : "";
    const bodyMessage = typeof record.message === "string" ? record.message.trim() : "";
    message = error || bodyMessage;
  }

  return { status, code, message: message || fallbackMessage };
}

export async function parseApiErrorEnvelope(
  response: Response,
  fallbackMessage: string
): Promise<ApiErrorEnvelope> {
  try {
    return normalizeApiErrorEnvelope(await response.clone().json(), response.status, fallbackMessage);
  } catch (error) {
    if (isApiRequestAborted(error)) throw error;
    return normalizeApiErrorEnvelope(null, response.status, fallbackMessage);
  }
}

export function getApiErrorMessage(body: unknown, fallbackMessage: string): string {
  return normalizeApiErrorEnvelope(body, 0, fallbackMessage).message;
}

export async function parseApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  return (await parseApiErrorEnvelope(response, fallbackMessage)).message;
}
