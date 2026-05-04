import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildWheelFairnessHtmlPage,
  escapeHtml,
  htmlResponse,
  truncateProofValue
} from "./fairnessRenderer";

test("fairness renderer escapes proof values before rendering public HTML", () => {
  const html = buildWheelFairnessHtmlPage({
    summaryTitle: "Verified <spin>",
    summary: "Result & proof",
    wheelName: "Wheel <script>alert(1)</script>",
    slotLabel: "Chase & bonus",
    spinNumber: 3,
    resultSlotNumber: 1,
    slotCount: 2,
    serverSeedHash: "a".repeat(64),
    layoutHash: "b".repeat(64),
    layoutSlots: [
      { name: "Slot <one>", color: "#f00", tier: "tier & one", isChase: false },
      { name: "Chase", color: "#0f0", tier: "tier-2", isChase: true }
    ],
    layoutError: "Layout <bad>",
    clientSeed: "client <seed>",
    serverSeed: "server & seed",
    proofHash: "c".repeat(64),
    algorithm: "whatfees-wheel-v1",
    jsonUrl: "https://api.example/wheel/fairness/verify?format=json&x=<bad>"
  });

  assert.match(html, /Wheel &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Chase &amp; bonus/);
  assert.match(html, /Slot &lt;one&gt;/);
  assert.match(html, /tier &amp; one/);
  assert.match(html, /Layout &lt;bad&gt;/);
  assert.match(html, /View raw JSON proof/);
  assert.match(html, /format=json&amp;x=&lt;bad&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test("fairness renderer keeps response and preview helpers small and deterministic", () => {
  assert.equal(escapeHtml("\"<&>'"), "&quot;&lt;&amp;&gt;&#39;");
  assert.equal(truncateProofValue("123456789012345678901234567890", 6, 4), "123456...7890");
  assert.deepEqual(htmlResponse(200, "<html></html>"), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    },
    body: "<html></html>"
  });
});
