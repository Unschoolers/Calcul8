export function getApiErrorMessage(body: unknown, fallbackMessage: string): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const error = String(record.error ?? "").trim();
    if (error) return error;
    const message = String(record.message ?? "").trim();
    if (message) return message;
  }

  return fallbackMessage;
}

export async function parseApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    return getApiErrorMessage(await response.json(), fallbackMessage);
  } catch {
    return fallbackMessage;
  }
}