import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createCapabilityPorts } from "../src/app-core/context/capabilityPorts.ts";

describe("capability ports", () => {
  test("exposes only declared live values and binds commands to their owner", () => {
    const source = {
      count: 1,
      hidden: "private",
      increment() {
        this.count += 1;
      }
    };

    const ports = createCapabilityPorts(source, ["count", "increment"] as const);
    assert.deepEqual(Object.keys(ports), ["count", "increment"]);
    assert.equal("hidden" in ports, false);

    source.count = 4;
    assert.equal(ports.count, 4);
    ports.increment();
    assert.equal(source.count, 5);

    ports.count = 8;
    assert.equal(source.count, 8);
  });
});
