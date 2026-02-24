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

export function requestGoogleIdentityPrompt(
  googleId: GoogleIdentityApi,
  schedule: (callback: () => void, delayMs: number) => void,
  cooldownMs = PROMPT_COOLDOWN_MS
): boolean {
  const now = Date.now();
  if (promptInFlight || now - lastPromptAt < cooldownMs) {
    return false;
  }

  promptInFlight = true;
  lastPromptAt = now;

  try {
    googleId.prompt();
  } catch {
    promptInFlight = false;
    throw new Error("Google sign-in prompt failed to open.");
  }

  schedule(() => {
    promptInFlight = false;
  }, cooldownMs);

  return true;
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

    requestGoogleIdentityPrompt(googleId, schedule, PROMPT_COOLDOWN_MS);
  };

  tryInit(retryCount);
}
