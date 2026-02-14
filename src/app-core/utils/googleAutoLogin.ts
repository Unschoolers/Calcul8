interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityConfig {
  client_id: string;
  auto_select?: boolean;
  itp_support?: boolean;
  callback: (response: GoogleCredentialResponse) => void;
}

export interface GoogleIdentityApi {
  initialize(config: GoogleIdentityConfig): void;
  prompt(): void;
}

interface InitGoogleAutoLoginInput {
  clientId: string;
  getGoogleIdentity: () => GoogleIdentityApi | undefined;
  onCredential: (idToken: string) => void;
  retryCount: number;
  retryDelayMs: number;
  schedule: (callback: () => void, delayMs: number) => void;
}

export function initGoogleAutoLoginWithRetry(input: InitGoogleAutoLoginInput): void {
  const {
    clientId,
    getGoogleIdentity,
    onCredential,
    retryCount,
    retryDelayMs,
    schedule
  } = input;

  if (!clientId) {
    return;
  }

  const tryInit = (attemptsLeft: number): void => {
    const googleId = getGoogleIdentity();
    if (!googleId) {
      if (attemptsLeft <= 0) return;
      schedule(() => tryInit(attemptsLeft - 1), retryDelayMs);
      return;
    }

    googleId.initialize({
      client_id: clientId,
      auto_select: true,
      itp_support: true,
      callback: (response: GoogleCredentialResponse) => {
        const idToken = response.credential?.trim();
        if (!idToken) return;
        onCredential(idToken);
      }
    });

    googleId.prompt();
  };

  tryInit(retryCount);
}
