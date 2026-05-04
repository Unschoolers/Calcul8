import type { HttpResponseInit } from "@azure/functions";
import type { WheelFairnessProofLayoutSlot } from "../../types";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function htmlResponse(status: number, html: string): HttpResponseInit {
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    },
    body: html
  };
}

export function truncateProofValue(value: string, leading = 14, trailing = 10): string {
  if (value.length <= leading + trailing + 3) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

export function buildWheelFairnessHtmlPage(params: {
  summaryTitle: string;
  summary: string;
  wheelName: string | null;
  slotLabel: string | null;
  spinNumber: number | null;
  resultSlotNumber: number;
  slotCount: number;
  serverSeedHash: string;
  layoutHash: string | null;
  layoutSlots: WheelFairnessProofLayoutSlot[] | null;
  layoutError: string | null;
  clientSeed: string;
  serverSeed: string;
  proofHash: string;
  algorithm: string;
  jsonUrl: string;
}): string {
  const title = escapeHtml(params.summaryTitle);
  const summary = escapeHtml(params.summary);
  const wheelName = params.wheelName ? escapeHtml(params.wheelName) : "Unknown wheel";
  const slotLabel = params.slotLabel || `Slot ${params.resultSlotNumber}`;
  const spinLabel = params.spinNumber != null ? `Spin #${params.spinNumber}` : "Verified spin";
  const resultText = `${slotLabel} • Slot ${params.resultSlotNumber} of ${params.slotCount}`;
  const jsonUrl = escapeHtml(params.jsonUrl);
  const serverSeedHash = escapeHtml(params.serverSeedHash);
  const layoutHash = params.layoutHash ? escapeHtml(params.layoutHash) : "";
  const clientSeed = escapeHtml(params.clientSeed);
  const serverSeed = escapeHtml(params.serverSeed);
  const proofHash = escapeHtml(params.proofHash);
  const algorithm = escapeHtml(params.algorithm);
  const serverSeedHashPreview = escapeHtml(truncateProofValue(params.serverSeedHash));
  const layoutHashPreview = params.layoutHash ? escapeHtml(truncateProofValue(params.layoutHash)) : "";
  const clientSeedPreview = escapeHtml(truncateProofValue(params.clientSeed));
  const serverSeedPreview = escapeHtml(truncateProofValue(params.serverSeed));
  const layoutError = params.layoutError ? escapeHtml(params.layoutError) : "";
  const layoutMarkup = (params.layoutSlots || []).map((slot, index) => {
    const badge = slot.isChase ? '<span class="layout-slot__badge">Chase</span>' : "";
    return `<li class="layout-slot">
      <span class="layout-slot__index">${index + 1}</span>
      <span class="layout-slot__swatch" style="background:${escapeHtml(slot.color)}"></span>
      <div class="layout-slot__content">
        <div class="layout-slot__name">${escapeHtml(slot.name)} ${badge}</div>
        <div class="layout-slot__meta">Tier: ${escapeHtml(slot.tier)} • ${escapeHtml(slot.color)}</div>
      </div>
    </li>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #171510;
        --panel: rgba(30, 27, 23, 0.92);
        --panel-2: rgba(39, 35, 30, 0.96);
        --panel-3: rgba(23, 27, 22, 0.88);
        --text: #f8f5ee;
        --muted: #c4bdae;
        --accent: #f5c84c;
        --good: #59d48a;
        --good-soft: rgba(89, 212, 138, 0.14);
        --border: rgba(255,255,255,0.08);
        --border-strong: rgba(255,255,255,0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(245,200,76,0.12), transparent 34%),
          linear-gradient(180deg, #1d1a14 0%, #14120f 100%);
        color: var(--text);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 28px 20px 56px;
      }
      .hero, .card {
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: 0 24px 54px rgba(0,0,0,0.24);
      }
      .hero { padding: 28px; margin-bottom: 20px; }
      .eyebrow {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        color: var(--good);
        font-size: 0.84rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 14px 0 12px;
        font-size: clamp(2rem, 5vw, 3rem);
        line-height: 1.04;
        letter-spacing: -0.03em;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .hero__lede {
        max-width: 44rem;
        font-size: 1.04rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin: 20px 0 0;
      }
      .metric {
        padding: 16px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--border);
      }
      .metric__label {
        color: var(--muted);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .metric__value {
        margin-top: 8px;
        font-size: 1.18rem;
        font-weight: 800;
      }
      .card {
        padding: 22px;
        margin-top: 18px;
      }
      .card h2 {
        margin: 0 0 12px;
        font-size: 1.25rem;
        letter-spacing: -0.02em;
      }
      .card h3 {
        margin: 0;
        font-size: 1rem;
        letter-spacing: -0.01em;
      }
      .trust-note {
        margin-top: -2px;
        max-width: 44rem;
      }
      .verify-panel {
        display: grid;
        gap: 16px;
        margin-top: 16px;
      }
      .verify-notes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
      }
      .verify-note {
        padding: 16px 18px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--border);
      }
      .verify-note--good {
        border-color: rgba(89, 212, 138, 0.18);
        background: linear-gradient(180deg, rgba(89, 212, 138, 0.07), rgba(255,255,255,0.01));
      }
      .verify-note--honest {
        border-color: rgba(245, 200, 76, 0.16);
      }
      .verify-note__label {
        color: var(--muted);
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 800;
      }
      .verify-note__body {
        margin-top: 8px;
        color: var(--text);
        font-size: 0.96rem;
        line-height: 1.45;
      }
      .verify-summary {
        padding: 16px 18px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--border);
      }
      .verify-summary--warning {
        border-color: rgba(245, 200, 76, 0.25);
        background: linear-gradient(180deg, rgba(245, 200, 76, 0.08), rgba(255,255,255,0.01));
      }
      .verify-summary p {
        margin-top: 8px;
      }
      .steps {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .step {
        padding: 16px 18px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--border);
        display: grid;
        gap: 10px;
      }
      .step__top {
        display: grid;
        gap: 6px;
      }
      .step__kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--good);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 800;
      }
      .step__title {
        font-size: 1rem;
        font-weight: 800;
        line-height: 1.25;
      }
      .step__body {
        color: var(--muted);
        font-size: 0.94rem;
        max-width: 58ch;
      }
      .step__proof {
        padding: 10px 12px;
        border-radius: 14px;
        background: var(--panel-3);
        border: 1px solid rgba(89, 212, 138, 0.12);
        max-width: 100%;
      }
      .step__proof-label {
        color: rgba(255,255,255,0.64);
        font-size: 0.74rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
      }
      .step__proof-value {
        font-size: 0.88rem;
        font-weight: 700;
        color: #f4efe4;
        word-break: break-word;
      }
      details {
        margin-top: 18px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: var(--panel);
        overflow: hidden;
      }
      summary {
        cursor: pointer;
        list-style: none;
        padding: 16px 18px;
        font-weight: 800;
      }
      summary::-webkit-details-marker { display: none; }
      .details-body {
        border-top: 1px solid var(--border);
        padding: 18px;
      }
      .proof-list {
        display: grid;
        gap: 12px;
      }
      .proof-item {
        padding: 14px;
        border-radius: 14px;
        background: var(--panel-2);
        border: 1px solid var(--border);
      }
      .proof-item__label {
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
      }
      code {
        display: block;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 0.92rem;
      }
      .footer-link {
        display: inline-flex;
        margin-top: 16px;
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }
      .helper {
        margin-top: 12px;
        font-size: 0.92rem;
      }
      .layout-list {
        list-style: none;
        margin: 14px 0 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      .layout-slot {
        display: grid;
        grid-template-columns: auto auto 1fr;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        background: var(--panel-2);
        border: 1px solid var(--border);
      }
      .layout-slot__index {
        width: 2rem;
        height: 2rem;
        display: inline-grid;
        place-items: center;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        font-weight: 800;
      }
      .layout-slot__swatch {
        width: 14px;
        height: 40px;
        border-radius: 999px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
      }
      .layout-slot__content {
        min-width: 0;
      }
      .layout-slot__name {
        font-weight: 800;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .layout-slot__meta {
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.88rem;
        word-break: break-word;
      }
      .layout-slot__badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(245, 200, 76, 0.14);
        color: var(--accent);
        font-size: 0.76rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      @media (max-width: 640px) {
        main {
          padding: 18px 14px 40px;
        }
        .hero,
        .card {
          border-radius: 20px;
        }
        .hero,
        .card,
        .details-body {
          padding-left: 16px;
          padding-right: 16px;
        }
        .layout-slot {
          grid-template-columns: auto 1fr;
        }
        .layout-slot__swatch {
          grid-row: span 2;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="eyebrow">Verified fair result</div>
        <h1>${title}</h1>
        <p class="hero__lede">${summary} This page proves the result was committed before it landed and can be reproduced from the revealed values. It also explains why the outcome came from secure random inputs, not a manual swap after the fact.</p>
        <div class="grid">
          <div class="metric">
            <div class="metric__label">Wheel</div>
            <div class="metric__value">${wheelName}</div>
          </div>
          <div class="metric">
            <div class="metric__label">Spin</div>
            <div class="metric__value">${escapeHtml(spinLabel)}</div>
          </div>
          <div class="metric">
            <div class="metric__label">Result</div>
            <div class="metric__value">${escapeHtml(resultText)}</div>
          </div>
          <div class="metric">
            <div class="metric__label">Randomness source</div>
            <div class="metric__value">Secure server seed + secure client seed.</div>
          </div>
        </div>
      </section>
      <section class="card">
        <h2>Why this page</h2>
        <p class="trust-note">This proof is strongest at answering two questions: was the result locked before the wheel landed, and did the revealed inputs really produce this slot?</p>

        <div class="verify-panel">
          <div class="verify-notes">
            <section class="verify-note verify-note--good">
              <div class="verify-note__label">What this does prove</div>
              <div class="verify-note__body">The operator could not change the result after committing to the hidden server seed, and anyone can reproduce the same winning slot from the revealed values and the exact ordered wheel layout used for this spin.</div>
            </section>

          <section class="verify-summary">
            <h3>Why the randomness claim is reasonable</h3>
            <p>The server seed is generated on the server with a cryptographically secure random generator. The client seed is generated independently in the viewer's browser environment with a secure random generator. The final slot is derived from both seeds together, then reproduced below.</p>
          </section>
          ${params.layoutError ? `<section class="verify-summary verify-summary--warning">
            <h3>Exact wheel order could not be shown</h3>
            <p>${layoutError} The base fairness proof still verifies the committed server seed, client seed, result slot, and layout hash.</p>
          </section>` : ""}
          </div>



          <div class="steps">
          <article class="step">
            <div class="step__top">
              <div class="step__kicker">Step 1</div>
              <div class="step__title">Check that the hidden result was locked in first</div>
              <div class="step__body">Hash the revealed server seed with SHA-256. If it matches the committed hash below, the hidden value was already locked in before the wheel landed.</div>
            </div>
            <div class="step__proof">
              <div class="step__proof-label">Committed hash</div>
              <div class="step__proof-value">${serverSeedHashPreview}</div>
            </div>
          </article>

          <article class="step">
            <div class="step__top">
              <div class="step__kicker">Step 2</div>
              <div class="step__title">Confirm the exact wheel layout that was locked for this spin</div>
              <div class="step__body">This proof also includes a SHA-256 hash of the exact ordered wheel layout. That binds the result to the wheel arrangement used for this spin, not just to the slot count.</div>
            </div>
            <div class="step__proof">
              <div class="step__proof-label">Ordered layout hash</div>
              <div class="step__proof-value">${layoutHashPreview || "Not provided"}</div>
            </div>
          </article>

          <article class="step">
            <div class="step__top">
              <div class="step__kicker">Step 3</div>
              <div class="step__title">Reproduce the winning slot</div>
              <div class="step__body">Using the revealed server seed, the client seed, and the bound wheel layout, the calculation should reproduce the same result: ${escapeHtml(resultText)}.</div>
            </div>
            <div class="step__proof">
              <div class="step__proof-label">Client seed used</div>
              <div class="step__proof-value">${clientSeedPreview}</div>
            </div>
          </article>

          <article class="step">
            <div class="step__top">
              <div class="step__kicker">Step 4</div>
              <div class="step__title">Check the revealed server seed</div>
              <div class="step__body">The revealed server seed below is the hidden value that was committed before the spin landed.</div>
            </div>
            <div class="step__proof">
              <div class="step__proof-label">Server seed revealed</div>
              <div class="step__proof-value">${serverSeedPreview}</div>
            </div>
          </article>
          </div>
        </div>

        <p class="helper">For advanced verification, the full technical proof is below.</p>

        ${params.layoutSlots && params.layoutSlots.length > 0 ? `<section class="card">
        <h2>Exact wheel order used for this spin</h2>
        <p class="trust-note">This is the full ordered slot list that was hashed into the proof for this spin. If someone changes the order, labels, colors, or chase markers, the layout hash will no longer match.</p>
        <ol class="layout-list">${layoutMarkup}</ol>
      </section>` : ""}

        <details>
          <summary>Advanced proof details</summary>
          <div class="details-body">
            <div class="proof-list">
              <div class="proof-item">
                <div class="proof-item__label">Committed server hash</div>
                <code>${serverSeedHash}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Ordered wheel layout hash</div>
                <code>${layoutHash || "Not provided"}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Client seed</div>
                <code>${clientSeed}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Server seed</div>
                <code>${serverSeed}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Derived proof hash</div>
                <code>${proofHash}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Algorithm</div>
                <code>${algorithm}</code>
              </div>
            </div>
            <a class="footer-link" href="${jsonUrl}" rel="noopener noreferrer">View raw JSON proof</a>
          </div>
        </details>
      </section>
    </main>
  </body>
</html>`;
}
