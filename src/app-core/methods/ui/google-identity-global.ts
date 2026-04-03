import type { GoogleIdentityApi } from "../../utils/googleAutoLogin.ts";

interface GoogleAccountsApi {
  id: GoogleIdentityApi;
}

export interface GoogleGlobalApi {
  accounts: GoogleAccountsApi;
}

declare global {
  interface Window {
    google?: GoogleGlobalApi;
  }
}

export {};
