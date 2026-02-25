import { HttpError } from "./auth";

const WORKSPACE_ID_REGEX = /^[A-Za-z0-9:_-]{1,128}$/;

export function parseOptionalWorkspaceId(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new HttpError(400, "Field 'workspaceId' must be a string when provided.");
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!WORKSPACE_ID_REGEX.test(normalized)) {
    throw new HttpError(
      400,
      "Field 'workspaceId' has an invalid format."
    );
  }
  return normalized;
}
