import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/vue";
import { afterEach } from "vitest";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: ResizeObserverStub
});

Object.defineProperty(window, "visualViewport", {
  writable: true,
  value: {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    width: 1024,
    height: 768,
    offsetLeft: 0,
    offsetTop: 0
  }
});

afterEach(() => {
  cleanup();
});
