import {
  IdentityCredentialError,
  type IdentityCredential,
  type IdentityCredentialMode,
  type IdentityCredentialPort
} from "./types.ts";

interface GoogleIdentityApi {
  initialize(config: {
    client_id: string;
    auto_select: boolean;
    itp_support: boolean;
    callback: (response: { credential?: string }) => void;
  }): void;
  prompt(callback?: (notification: {
    isNotDisplayed?: () => boolean;
    isSkippedMoment?: () => boolean;
    isDismissedMoment?: () => boolean;
  }) => void): void;
  disableAutoSelect?(): void;
}

export function createWebGoogleIdentityPort(params: {
  clientId: string;
  googleIdentity?: GoogleIdentityApi;
}): IdentityCredentialPort | null {
  const clientId = params.clientId.trim();
  const googleIdentity = params.googleIdentity;
  if (!clientId || !googleIdentity) return null;

  return {
    requestCredential(mode: IdentityCredentialMode): Promise<IdentityCredential> {
      return new Promise((resolve, reject) => {
        googleIdentity.initialize({
          client_id: clientId,
          auto_select: mode === "automatic",
          itp_support: true,
          callback: ({ credential }) => {
            const idToken = credential?.trim() ?? "";
            if (!idToken) {
              reject(new IdentityCredentialError("invalid_credential", "Google returned no ID token."));
              return;
            }
            resolve({ idToken, displayName: null, photoUrl: null });
          }
        });
        googleIdentity.prompt((notification) => {
          if (
            notification.isNotDisplayed?.()
            || notification.isSkippedMoment?.()
            || notification.isDismissedMoment?.()
          ) {
            reject(new IdentityCredentialError("cancelled", "Google sign-in was cancelled."));
          }
        });
      });
    },
    async clearCredentialState(): Promise<void> {
      googleIdentity.disableAutoSelect?.();
    }
  };
}
