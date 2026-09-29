import { randomBytes } from "node:crypto";
import { HttpError } from "../../lib/auth";
import { buildShopifyAuthorizeUrl, encryptShopifyToken, exchangeShopifyCode, isShopifyDomain, verifyShopifyCallback } from "../../lib/shopify";

type ShopifyConfig = {
  shopifyClientId?: string;
  shopifyClientSecret?: string;
  shopifyRedirectUri?: string;
  shopifyTokenEncryptionSecret?: string;
  allowedOrigins: string[];
};

type Scope = { partitionKey: string; scopeType: "user" | "workspace"; scopeId: string };
export type ShopifyScopeResolver = (actorUserId: string, workspaceId?: string, requireOwner?: boolean) => Promise<Scope>;

export type ShopifyOAuthState = {
  state: string;
  shop: string;
  actorUserId: string;
  scopeKey: string;
  scopeType: Scope["scopeType"];
  scopeId: string;
  appReturnUrl: string;
  generation: number;
  expiresAt: string;
};

export type ShopifyConnection = {
  scopeKey: string;
  scopeType: Scope["scopeType"];
  scopeId: string;
  shop: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext?: string;
  tokenExpiresAt?: string;
  scopes: string[];
  connectedByUserId: string;
  updatedAt: string;
};

export type ShopifyConnectionStore = {
  createState: (state: ShopifyOAuthState) => Promise<void>;
  /** Must claim a state at most once, including concurrent callbacks. */
  consumeState: (state: string) => Promise<ShopifyOAuthState | null>;
  getConnection: (scopeKey: string) => Promise<ShopifyConnection | null>;
  getGeneration: (scopeKey: string) => Promise<number>;
  putConnection: (connection: ShopifyConnection, expectedGeneration: number) => Promise<void>;
};

function settings(config: ShopifyConfig): { clientId: string; clientSecret: string; redirectUri: string; encryptionSecret: string } {
  if (!config.shopifyClientId || !config.shopifyClientSecret || !config.shopifyRedirectUri || !config.shopifyTokenEncryptionSecret) {
    throw new HttpError(503, "Shopify integration is not configured");
  }
  return { clientId: config.shopifyClientId, clientSecret: config.shopifyClientSecret, redirectUri: config.shopifyRedirectUri, encryptionSecret: config.shopifyTokenEncryptionSecret };
}

function validatedReturnUrl(config: ShopifyConfig, raw: string): string {
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new HttpError(400, "Invalid app return URL"); }
  if (!config.allowedOrigins.includes(url.origin) || !["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "Invalid app return URL");
  return url.toString();
}

export async function beginShopifyConnection(
  config: ShopifyConfig,
  store: ShopifyConnectionStore,
  resolveScope: ShopifyScopeResolver,
  input: { actorUserId: string; shop: string; workspaceId?: string; appReturnUrl: string }
): Promise<string> {
  const { clientId, redirectUri } = settings(config);
  const shop = input.shop.toLowerCase();
  if (!isShopifyDomain(shop)) throw new HttpError(400, "Invalid Shopify shop");
  const appReturnUrl = validatedReturnUrl(config, input.appReturnUrl);
  const scope = await resolveScope(input.actorUserId, input.workspaceId, true);
  const state = randomBytes(24).toString("hex");
  const generation = await store.getGeneration(scope.partitionKey);
  await store.createState({ state, shop, actorUserId: input.actorUserId, scopeKey: scope.partitionKey,
    scopeType: scope.scopeType, scopeId: scope.scopeId, appReturnUrl, generation, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
  return buildShopifyAuthorizeUrl({ shop, clientId, redirectUri, state });
}

export async function completeShopifyConnection(
  config: ShopifyConfig,
  store: ShopifyConnectionStore,
  resolveScope: ShopifyScopeResolver,
  params: URLSearchParams,
  fetcher: typeof fetch = fetch
): Promise<{ redirectUrl: string }> {
  const { clientId, clientSecret, encryptionSecret } = settings(config);
  if (!verifyShopifyCallback(params, clientSecret)) throw new HttpError(400, "Invalid Shopify callback");
  const stateToken = params.get("state");
  const shop = params.get("shop");
  const code = params.get("code");
  if (!stateToken || !shop) throw new HttpError(400, "Incomplete Shopify callback");
  const state = await store.consumeState(stateToken);
  if (!state || state.shop !== shop || Date.parse(state.expiresAt) <= Date.now()) throw new HttpError(400, "Shopify connection expired");
  if (params.get("error")) {
    const redirectUrl = new URL(validatedReturnUrl(config, state.appReturnUrl));
    redirectUrl.searchParams.set("shopify", "cancelled");
    return { redirectUrl: redirectUrl.toString() };
  }
  if (!code) throw new HttpError(400, "Incomplete Shopify callback");
  const scope = await resolveScope(state.actorUserId, state.scopeType === "workspace" ? state.scopeId : undefined, true);
if (scope.partitionKey !== state.scopeKey) throw new HttpError(403, "Shopify connection scope changed");
const current = await store.getConnection(state.scopeKey);
if (current && current.shop !== shop) throw new HttpError(409, "Disconnect the current Shopify store before connecting another store.");
const token = await exchangeShopifyCode({ shop, clientId, clientSecret, code }, fetcher);
  await store.putConnection({ scopeKey: state.scopeKey, scopeType: state.scopeType, scopeId: state.scopeId,
    shop, accessTokenCiphertext: encryptShopifyToken(encryptionSecret, token.access_token),
    refreshTokenCiphertext: token.refresh_token ? encryptShopifyToken(encryptionSecret, token.refresh_token) : undefined,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : undefined,
    scopes: token.scope.split(",").filter(Boolean), connectedByUserId: state.actorUserId, updatedAt: new Date().toISOString() }, state.generation);
  return { redirectUrl: validatedReturnUrl(config, state.appReturnUrl) };
}
