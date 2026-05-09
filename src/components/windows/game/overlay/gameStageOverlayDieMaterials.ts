import * as THREE from "three";
import { getDicePipLayout, getOverlayDieBoxFaceValues } from "./gameStageOverlayDice.ts";

const FACE_TEXTURE_SIZE = 256;
const FACE_CENTER = FACE_TEXTURE_SIZE / 2;
const FACE_SPREAD = FACE_TEXTURE_SIZE * 0.21;
const FACE_PIP_RADIUS = FACE_TEXTURE_SIZE * 0.072;
const MAX_PIP_OFFSET = 0.34;

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

function createFaceTexture(value: number, theme: OverlayDieMaterialTheme): THREE.CanvasTexture {
  const canvas = createCanvas();
  const context = canvas.getContext("2d");
  if (context == null) {
    throw new Error("Dice face textures require a 2D canvas context.");
  }

  const faceColor = colorNumberToCss(theme.faceColor);
  const pipColor = colorNumberToCss(theme.pipColor);
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

  for (const point of getDicePipLayout(value)) {
    const normalizedX = point.x / MAX_PIP_OFFSET;
    const normalizedY = point.y / MAX_PIP_OFFSET;
    const centerX = FACE_CENTER + normalizedX * FACE_SPREAD;
    const centerY = FACE_CENTER - normalizedY * FACE_SPREAD;

    context.fillStyle = "rgba(0,0,0,0.26)";
    context.beginPath();
    context.arc(centerX, centerY, FACE_PIP_RADIUS * 1.08, 0, Math.PI * 2);
    context.fill();

    const pipGradient = context.createRadialGradient(
      centerX - FACE_PIP_RADIUS * 0.22,
      centerY - FACE_PIP_RADIUS * 0.22,
      FACE_PIP_RADIUS * 0.18,
      centerX,
      centerY,
      FACE_PIP_RADIUS
    );
    pipGradient.addColorStop(0, theme.shadowColor);
    pipGradient.addColorStop(0.35, pipColor);
    pipGradient.addColorStop(1, "rgba(0,0,0,0.78)");
    context.fillStyle = pipGradient;
    context.beginPath();
    context.arc(centerX, centerY, FACE_PIP_RADIUS, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = FACE_TEXTURE_SIZE * 0.008;
    context.beginPath();
    context.arc(centerX, centerY, FACE_PIP_RADIUS * 0.92, Math.PI * 0.15, Math.PI * 1.15);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas as TexImageSource);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createOverlayDieMaterialSet(theme: OverlayDieMaterialTheme): OverlayDieMaterialSet {
  const textures = getOverlayDieBoxFaceValues().map((value) => createFaceTexture(value, theme));
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
