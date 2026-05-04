import type { HttpRequest } from "@azure/functions";

export function buildVerificationUrl(
  request: HttpRequest,
  serverSeed: string,
  clientSeed: string,
  slotCount: number,
  layoutHash: string | null
): string {
  const fallbackUrl = "https://api.example/wheel/fairness/reveal";
  const url = new URL(request.url || fallbackUrl);
  const pathMatch = /^(.*)\/wheel\/fairness\/reveal$/i.exec(url.pathname);
  let routePrefix = pathMatch?.[1] ?? "";
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!routePrefix && isLocalhost) {
    routePrefix = "/api";
  }
  url.pathname = `${routePrefix}/wheel/fairness/verify`.replace(/\/+/g, "/");
  url.search = "";
  url.searchParams.set("serverSeed", serverSeed);
  url.searchParams.set("clientSeed", clientSeed);
  url.searchParams.set("slotCount", String(slotCount));
  if (layoutHash) {
    url.searchParams.set("layoutHash", layoutHash);
  }
  return url.toString();
}

export function buildVerificationJsonUrl(
  request: HttpRequest,
  serverSeed: string,
  clientSeed: string,
  slotCount: number,
  layoutHash: string | null
): string {
  const url = new URL(buildVerificationUrl(request, serverSeed, clientSeed, slotCount, layoutHash));
  url.searchParams.set("format", "json");
  return url.toString();
}

export function buildStoredProofVerificationUrl(
  request: HttpRequest,
  proofId: string,
  format: "html" | "json"
): string {
  const fallbackUrl = "https://api.example/wheel/fairness/proof";
  const url = new URL(request.url || fallbackUrl);
  const pathMatch = /^(.*)\/wheel\/fairness\/(?:proof|verify)$/i.exec(url.pathname);
  let routePrefix = pathMatch?.[1] ?? "";
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!routePrefix && isLocalhost) {
    routePrefix = "/api";
  }
  url.pathname = `${routePrefix}/wheel/fairness/verify`.replace(/\/+/g, "/");
  url.search = "";
  url.searchParams.set("proofId", proofId);
  url.searchParams.set("format", format);
  return url.toString();
}
