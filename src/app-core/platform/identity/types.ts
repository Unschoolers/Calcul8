export interface IdentityCredential {
  idToken: string;
  displayName: string | null;
  photoUrl: string | null;
}

export type IdentityCredentialMode = "automatic" | "interactive";

export interface IdentityCredentialPort {
  requestCredential(mode: IdentityCredentialMode): Promise<IdentityCredential>;
  clearCredentialState(): Promise<void>;
}

export class IdentityCredentialError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "IdentityCredentialError";
  }
}
