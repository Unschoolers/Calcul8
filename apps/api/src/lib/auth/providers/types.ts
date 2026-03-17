import type { ApiConfig } from "../../../types";

export interface BearerAuthIdentity {
  userId: string;
  displayName?: string;
  photoUrl?: string;
}

export interface BearerAuthProvider {
  readonly name: string;
  resolveIdentityFromBearerToken(token: string, config: ApiConfig): Promise<BearerAuthIdentity | null>;
}
