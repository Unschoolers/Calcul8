import type { WheelSlot } from "../services/wheelHelpers.ts";

export type WheelRenderCache = {
  canvas: HTMLCanvasElement;
  slotsRef: WheelSlot[];
  size: number;
  dpr: number;
};

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16)
  ];
}

export function getWheelCanvasDpr(): number {
  return Math.max(
    1,
    Math.min(
      3,
      Math.floor((((globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1) * 100)) / 100
    )
  );
}

export function ensureWheelCanvasSize(canvasEl: HTMLCanvasElement, size: number, dpr: number): void {
  const backingSize = Math.max(20, Math.round(size * dpr));
  if (canvasEl.width !== backingSize || canvasEl.height !== backingSize) {
    canvasEl.width = backingSize;
    canvasEl.height = backingSize;
    canvasEl.style.width = `${size}px`;
    canvasEl.style.height = `${size}px`;
  }
}

export function renderWheelSurface(
  ctx: CanvasRenderingContext2D,
  slots: WheelSlot[],
  size: number,
  offset = 0,
  highlightedSlotIndex = -1,
  highlightTime = 0
): void {
  const cx = Math.round(size / 2);
  const cy = Math.round(size / 2);
  const rimWidth = Math.max(8, Math.round(size * 0.026));
  const r = Math.round(size / 2 - 10 - rimWidth);
  const sliceAngle = (2 * Math.PI) / slots.length;
  const pulse = highlightedSlotIndex >= 0 ? (Math.sin(highlightTime * Math.PI * 1.2) + 1) / 2 : 0;

  slots.forEach((slot, i) => {
    const startAngle = offset + i * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    const [cr, cg, cb] = parseHexColor(slot.color);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const darken = `rgb(${Math.round(cr * 0.82)}, ${Math.round(cg * 0.82)}, ${Math.round(cb * 0.82)})`;
    const base = `rgb(${cr}, ${cg}, ${cb})`;
    const lift = `rgb(${Math.min(255, Math.round(cr * 1.08))}, ${Math.min(255, Math.round(cg * 1.08))}, ${Math.min(255, Math.round(cb * 1.08))})`;
    grad.addColorStop(0, darken);
    grad.addColorStop(0.35, base);
    grad.addColorStop(0.75, lift);
    grad.addColorStop(1, base);
    ctx.fillStyle = grad;
    ctx.fill();

    if (i === highlightedSlotIndex) {
      const glowAlpha = 0.12 + 0.14 * pulse;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 245, 200, ${glowAlpha})`;
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = `rgba(255, 220, 100, ${0.5 + 0.4 * pulse})`;
      ctx.lineWidth = 3 + 2 * pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, startAngle + 0.01, endAngle - 0.01);
      ctx.stroke();
      ctx.restore();
    } else if (highlightedSlotIndex >= 0) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
      ctx.fill();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const baseFontSize = slots.length > 16 ? 0.022 : slots.length > 10 ? 0.025 : 0.028;
    const fontSize = Math.max(8, Math.round(size * baseFontSize));
    ctx.font = `bold ${fontSize}px sans-serif`;
    const maxChars = Math.max(10, Math.floor(size / 18));
    const label = slot.isChase ? "⭐ " + slot.name : slot.name;
    const txt = label.length > maxChars ? label.substring(0, maxChars - 2) + "…" : label;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.strokeText(txt, r - 14, 2);
    ctx.fillStyle = "#fff";
    ctx.fillText(txt, r - 14, 2);
    ctx.restore();
  });

  ctx.save();
  const cx2 = Math.round(size / 2);
  const cy2 = Math.round(size / 2);
  const sheenGrad = ctx.createRadialGradient(cx2, cy2 - r * 0.5, r * 0.1, cx2, cy2, r);
  sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
  sheenGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.03)");
  sheenGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = sheenGrad;
  ctx.beginPath();
  ctx.arc(cx2, cy2, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = 1.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < slots.length; i++) {
    const angle = offset + i * sliceAngle;
    ctx.beginPath();
    ctx.moveTo(cx2, cy2);
    ctx.lineTo(cx2 + Math.cos(angle) * r, cy2 + Math.sin(angle) * r);
    ctx.stroke();
  }
  ctx.restore();

  const outerR = r + rimWidth;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx2, cy2, outerR, 0, 2 * Math.PI);
  ctx.arc(cx2, cy2, r, 0, 2 * Math.PI, true);
  ctx.closePath();
  const rimGrad = ctx.createRadialGradient(cx2, cy2, r, cx2, cy2, outerR);
  rimGrad.addColorStop(0, "rgba(60, 50, 40, 0.80)");
  rimGrad.addColorStop(0.2, "rgba(160, 145, 110, 0.50)");
  rimGrad.addColorStop(0.45, "rgba(210, 195, 160, 0.45)");
  rimGrad.addColorStop(0.55, "rgba(230, 220, 190, 0.50)");
  rimGrad.addColorStop(0.8, "rgba(140, 120, 80, 0.55)");
  rimGrad.addColorStop(1, "rgba(50, 40, 30, 0.85)");
  ctx.fillStyle = rimGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 230, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx2, cy2, r + 1, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx2, cy2, outerR, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();

  if (highlightedSlotIndex >= 0) {
    ctx.save();
    const bulbCount = 24;
    const bulbR = Math.max(2.5, rimWidth * 0.28);
    const midR = r + rimWidth * 0.5;
    for (let i = 0; i < bulbCount; i++) {
      const angle = (i / bulbCount) * 2 * Math.PI;
      const bx = cx2 + Math.cos(angle) * midR;
      const by = cy2 + Math.sin(angle) * midR;
      const chaserOffset = Math.floor(highlightTime * 0.8 * bulbCount) % bulbCount;
      const on = ((i + chaserOffset) % 3) === 0;
      if (on) {
        const bulbGlow = ctx.createRadialGradient(bx, by, 0, bx, by, bulbR * 3);
        const isGold = i % 2 === 0;
        bulbGlow.addColorStop(0, isGold ? "rgba(255, 230, 120, 0.90)" : "rgba(255, 255, 255, 0.90)");
        bulbGlow.addColorStop(0.4, isGold ? "rgba(255, 200, 50, 0.35)" : "rgba(200, 220, 255, 0.35)");
        bulbGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = bulbGlow;
        ctx.beginPath();
        ctx.arc(bx, by, bulbR * 3, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = on
        ? (i % 2 === 0 ? "rgba(255, 235, 140, 0.95)" : "rgba(240, 245, 255, 0.95)")
        : "rgba(80, 70, 50, 0.50)";
      ctx.beginPath();
      ctx.arc(bx, by, bulbR, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  const hubR = Math.round(size * 0.05);
  const hubGrad = ctx.createRadialGradient(cx2 - hubR * 0.25, cy2 - hubR * 0.25, 0, cx2, cy2, hubR);
  hubGrad.addColorStop(0, "rgba(230, 220, 200, 0.95)");
  hubGrad.addColorStop(0.35, "rgba(170, 155, 120, 0.90)");
  hubGrad.addColorStop(0.75, "rgba(70, 55, 40, 0.92)");
  hubGrad.addColorStop(1, "rgba(30, 25, 18, 0.95)");
  ctx.fillStyle = hubGrad;
  ctx.beginPath();
  ctx.arc(cx2, cy2, hubR, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = "rgba(180, 165, 130, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx2, cy2, hubR, 0, 2 * Math.PI);
  ctx.stroke();
  const pinR = Math.round(hubR * 0.35);
  const pinGrad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, pinR);
  pinGrad.addColorStop(0, "rgba(255, 130, 110, 0.95)");
  pinGrad.addColorStop(1, "rgba(180, 50, 40, 0.90)");
  ctx.fillStyle = pinGrad;
  ctx.beginPath();
  ctx.arc(cx2, cy2, pinR, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

function createWheelCacheCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const documentLike = sourceCanvas.ownerDocument ?? (globalThis as { document?: Document }).document;
  if (!documentLike?.createElement) return null;
  return documentLike.createElement("canvas");
}

export function getStaticWheelRender(
  context: Record<string, unknown>,
  sourceCanvas: HTMLCanvasElement,
  slots: WheelSlot[],
  size: number,
  dpr: number
): HTMLCanvasElement | null {
  const existingCache = context._wheelStaticRenderCache as WheelRenderCache | undefined;
  if (
    existingCache
    && existingCache.slotsRef === slots
    && existingCache.size === size
    && existingCache.dpr === dpr
  ) {
    return existingCache.canvas;
  }

  const cacheCanvas = createWheelCacheCanvas(sourceCanvas);
  if (!cacheCanvas) return null;

  ensureWheelCanvasSize(cacheCanvas, size, dpr);
  const cacheCtx = cacheCanvas.getContext("2d");
  if (!cacheCtx) return null;

  cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cacheCtx.clearRect(0, 0, size, size);
  cacheCtx.imageSmoothingEnabled = true;
  renderWheelSurface(cacheCtx, slots, size);

  context._wheelStaticRenderCache = {
    canvas: cacheCanvas,
    slotsRef: slots,
    size,
    dpr
  } satisfies WheelRenderCache;

  return cacheCanvas;
}
