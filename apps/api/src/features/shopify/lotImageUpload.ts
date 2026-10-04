import { normalizeSyncLotImage } from "../../shared/sync-contracts.cjs";

export type StagedImageTarget = { url: string; resourceUrl: string; parameters: { name: string; value: string }[] };

/** The lot remains independent of Shopify; only draft creation copies its image. */
export async function uploadLotImage(input: {
  image: string; filename: string;
  stage: (mimeType: string, filename: string) => Promise<StagedImageTarget>;
  fetcher: typeof fetch; assertCurrent?: () => Promise<void>;
}): Promise<string> {
  try {
    const image = normalizeSyncLotImage(input.image);
    if (!image) throw new Error("Invalid lot image; upload a supported image and save the lot");
    const comma = image.indexOf(",");
    const mimeType = image.slice(5, image.indexOf(";"));
    const filename = `${input.filename}.${mimeType === "image/jpeg" ? "jpg" : mimeType.slice(6)}`;
    const target = await input.stage(mimeType, filename);
    if (new URL(target.url).protocol !== "https:" || new URL(target.resourceUrl).protocol !== "https:") throw new Error("Shopify returned an invalid image upload target");
    const body = new FormData();
    for (const parameter of target.parameters) body.append(parameter.name, parameter.value);
    body.append("file", new Blob([new Uint8Array(Buffer.from(image.slice(comma + 1), "base64"))], { type: mimeType }), filename);
    await input.assertCurrent?.();
    const response = await input.fetcher(target.url, { method: "POST", body, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Shopify image upload failed (${response.status}); retry draft creation`);
    return target.resourceUrl;
  } catch (error) {
    // No product was created. An upload failure must remain retryable and visible.
    throw Object.assign(error instanceof Error ? error : new Error("Shopify image upload failed"), { definitive: true, imageUploadFailed: true });
  }
}
