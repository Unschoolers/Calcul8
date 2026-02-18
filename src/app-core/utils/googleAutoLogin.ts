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

const PROMPT_COOLDOWN_MS = 1500;
let promptInFlight = false;
let lastPromptAt = 0;

export function __resetGoogleAutoLoginForTests(): void {
  promptInFlight = false;
  lastPromptAt = 0;
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
        promptInFlight = false;
        const idToken = response.credential?.trim();
        if (!idToken) return;
        onCredential(idToken);
      }
    });

    const now = Date.now();
    if (promptInFlight || now - lastPromptAt < PROMPT_COOLDOWN_MS) {
      return;
    }

    promptInFlight = true;
    lastPromptAt = now;
    googleId.prompt();
    schedule(() => {
      promptInFlight = false;
    }, PROMPT_COOLDOWN_MS);
  };

  tryInit(retryCount);
}
