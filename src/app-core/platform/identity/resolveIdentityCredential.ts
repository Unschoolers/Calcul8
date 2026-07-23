import { getAppRuntime } from "../runtime.ts";
import { createNativeGoogleIdentityPort } from "./nativeGoogleIdentity.ts";
import { createWebGoogleIdentityPort } from "./webGoogleIdentity.ts";
import type { IdentityCredentialPort } from "./types.ts";

export function resolveIdentityCredential(params: {
  clientId?: string;
  googleIdentity?: Parameters<typeof createWebGoogleIdentityPort>[0]["googleIdentity"];
} = {}): IdentityCredentialPort | null {
  if (getAppRuntime() === "android") {
    return createNativeGoogleIdentityPort();
  }
  return createWebGoogleIdentityPort({
    clientId: params.clientId ?? "",
    googleIdentity: params.googleIdentity
  });
}
