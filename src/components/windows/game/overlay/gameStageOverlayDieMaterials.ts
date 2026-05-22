import * as THREE from "three";
import { getOverlayDieBoxFaceValues } from "./gameStageOverlayDice.ts";

const FACE_TEXTURE_SIZE = 1024;
const FACE_TEXTURE_ANISOTROPY = 16;
const FACE_CENTER = FACE_TEXTURE_SIZE / 2;

export type OverlayDieMaterialTheme = {
  faceColor: number;
  pipColor: number;
  shadowColor: string;
  highlightColor: string;
};

export type OverlayDieMaterialSet = {
  materials: THREE.MeshPhysicalMaterial[];
  textures: THREE.CanvasTexture[];
};

export function getOverlayDieFaceTextureSpec(): { sizePx: number; anisotropy: number } {
  return {
    sizePx: FACE_TEXTURE_SIZE,
    anisotropy: FACE_TEXTURE_ANISOTROPY
  };
}

function colorNumberToCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function createCanvas(): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = FACE_TEXTURE_SIZE;
    canvas.height = FACE_TEXTURE_SIZE;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE);
  }
  throw new Error("Dice face textures require canvas support.");
}

function createFaceTexture(theme: OverlayDieMaterialTheme): THREE.CanvasTexture {
  const canvas = createCanvas();
  const context = canvas.getContext("2d");
  if (context == null) {
    throw new Error("Dice face textures require a 2D canvas context.");
  }

  const faceColor = colorNumberToCss(theme.faceColor);
  const baseGradient = context.createLinearGradient(0, 0, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE);
  baseGradient.addColorStop(0, theme.highlightColor);
  baseGradient.addColorStop(0.52, faceColor);
  baseGradient.addColorStop(1, theme.shadowColor);
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE);

  const vignette = context.createRadialGradient(
    FACE_CENTER,
    FACE_CENTER * 0.88,
    FACE_TEXTURE_SIZE * 0.12,
    FACE_CENTER,
    FACE_CENTER,
    FACE_TEXTURE_SIZE * 0.72
  );
  vignette.addColorStop(0, "rgba(255,255,255,0.06)");
  vignette.addColorStop(1, "rgba(0,0,0,0.22)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas as TexImageSource);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = FACE_TEXTURE_ANISOTROPY;
  texture.needsUpdate = true;
  return texture;
}

export function createOverlayDieMaterialSet(theme: OverlayDieMaterialTheme): OverlayDieMaterialSet {
  const textures = getOverlayDieBoxFaceValues().map(() => createFaceTexture(theme));
  const materials = textures.map((texture) => new THREE.MeshPhysicalMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.18,
    clearcoat: 0.34,
    clearcoatRoughness: 0.42
  }));

  return {
    materials,
    textures
  };
}
