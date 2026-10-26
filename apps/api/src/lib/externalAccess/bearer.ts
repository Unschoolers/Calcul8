import { ExternalError } from "./errors";

const MAX_AUTHORIZATION_LENGTH = 8192;
// Validate the entire single credential before classifying its scheme. This
// prevents malformed unsupported schemes bypassing the same lexical boundary.
const CREDENTIAL = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+) +([A-Za-z0-9._~+/-]+=*)$/;

/** Syntax only: the returned opaque credential has not been authenticated. */
export function parseExternalBearerToken(authorization: string | null | undefined): string {
  if (authorization === undefined || authorization === null || authorization === "") {
    throw new ExternalError("authentication_required");
  }
  if (typeof authorization !== "string" || authorization.length > MAX_AUTHORIZATION_LENGTH) {
    throw new ExternalError("invalid_request");
  }
  for (let index = 0; index < authorization.length; index += 1) {
    const code = authorization.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) throw new ExternalError("invalid_request");
  }
  const match = CREDENTIAL.exec(authorization);
  if (!match) throw new ExternalError("invalid_request");
  if (match[1].toLowerCase() !== "bearer") throw new ExternalError("authentication_required");
  return match[2];
}
