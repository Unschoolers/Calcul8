export const SINGLES_IMAGE_UPLOAD_MAX_EDGE = 640;
export const SINGLES_IMAGE_UPLOAD_MAX_BYTES = 160_000;

export type SinglesImageUploadErrorCode = "invalid_type" | "read_failed" | "too_large";

export class SinglesImageUploadError extends Error {
  code: SinglesImageUploadErrorCode;

  constructor(code: SinglesImageUploadErrorCode) {
    super(code);
    this.name = "SinglesImageUploadError";
    this.code = code;
  }
}

const RASTER_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "heic",
  "heif"
]);

export function isSinglesImageUploadFile(file: Pick<File, "type" | "name"> | null | undefined): boolean {
  if (!file) return false;
  const type = String(file.type || "").trim().toLocaleLowerCase();
  if (type) return type.startsWith("image/") && type !== "image/svg+xml";

  const extension = String(file.name || "")
    .split(".")
    .pop()
    ?.trim()
    .toLocaleLowerCase() || "";
  return RASTER_IMAGE_EXTENSIONS.has(extension);
}

export function getSinglesImageDataUrlByteLength(dataUrl: string): number {
  const value = String(dataUrl || "");
  const commaIndex = value.indexOf(",");
  const payload = commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
  if (!payload) return 0;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new SinglesImageUploadError("read_failed"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new SinglesImageUploadError("read_failed"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new SinglesImageUploadError("read_failed"));
    image.src = dataUrl;
  });
}

function resolveBoundedSize(width: number, height: number): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const longestEdge = Math.max(safeWidth, safeHeight);
  if (longestEdge <= SINGLES_IMAGE_UPLOAD_MAX_EDGE) {
    return { width: safeWidth, height: safeHeight };
  }

  const scale = SINGLES_IMAGE_UPLOAD_MAX_EDGE / longestEdge;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale))
  };
}

function encodeCanvasAsJpeg(canvas: HTMLCanvasElement): string {
  const qualities = [0.84, 0.74, 0.62, 0.52];
  let latestDataUrl = "";

  for (const quality of qualities) {
    latestDataUrl = canvas.toDataURL("image/jpeg", quality);
    if (getSinglesImageDataUrlByteLength(latestDataUrl) <= SINGLES_IMAGE_UPLOAD_MAX_BYTES) {
      return latestDataUrl;
    }
  }

  throw new SinglesImageUploadError("too_large");
}

export async function compressSinglesImageFile(file: File): Promise<string> {
  if (!isSinglesImageUploadFile(file)) {
    throw new SinglesImageUploadError("invalid_type");
  }

  if (typeof document === "undefined" || typeof FileReader === "undefined" || typeof Image === "undefined") {
    throw new SinglesImageUploadError("read_failed");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const size = resolveBoundedSize(imageWidth, imageHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new SinglesImageUploadError("read_failed");
  }

  // Preserve transparent PNG/GIF uploads against the dark app surface.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size.width, size.height);

  return encodeCanvasAsJpeg(canvas);
}
