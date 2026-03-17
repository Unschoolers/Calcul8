import type { ApiConfig } from "../../../types";

export interface BearerAuthProvider {
  readonly name: string;
  resolveUserIdFromBearerToken(token: string, config: ApiConfig): Promise<string | null>;
}
