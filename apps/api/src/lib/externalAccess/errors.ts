export const EXTERNAL_ERROR_CATALOG = Object.freeze({
  invalid_request: Object.freeze({ status: 400, message: "The request is invalid." }),
  authentication_required: Object.freeze({ status: 401, message: "Authentication is required." }),
  invalid_token: Object.freeze({ status: 401, message: "The access token is invalid." }),
  insufficient_scope: Object.freeze({ status: 403, message: "Required permissions are missing." }),
  forbidden: Object.freeze({ status: 403, message: "Access is forbidden." }),
  not_found: Object.freeze({ status: 404, message: "The resource was not found." }),
  conflict: Object.freeze({ status: 409, message: "The resource has changed." }),
  precondition_failed: Object.freeze({ status: 412, message: "The precondition was not met." }),
  unprocessable_entity: Object.freeze({ status: 422, message: "The request cannot be processed." }),
  rate_limited: Object.freeze({ status: 429, message: "Too many requests." }),
  internal_error: Object.freeze({ status: 500, message: "The request could not be completed." }),
  temporarily_unavailable: Object.freeze({ status: 503, message: "The service is temporarily unavailable." })
} as const);

export type ExternalErrorCode = keyof typeof EXTERNAL_ERROR_CATALOG;

function isExternalErrorCode(code: unknown): code is ExternalErrorCode {
  return typeof code === "string"
    && Object.prototype.hasOwnProperty.call(EXTERNAL_ERROR_CATALOG, code);
}

export class ExternalError extends Error {
  readonly code: ExternalErrorCode;
  readonly status: number;

  constructor(code: ExternalErrorCode) {
    if (!isExternalErrorCode(code)) {
      throw new TypeError("Invalid external error code.");
    }

    const entry = EXTERNAL_ERROR_CATALOG[code];
    super(entry.message);
    this.name = "ExternalError";
    this.code = code;
    this.status = entry.status;
    Object.defineProperty(this, "stack", {
      value: this.stack,
      writable: true,
      configurable: true,
      enumerable: false
    });
    Object.freeze(this);
  }
}
