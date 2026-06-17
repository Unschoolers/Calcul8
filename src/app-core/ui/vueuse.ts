import { useResizeObserver } from "@vueuse/core";

export type StopHandle = () => void;

export function observeElementResize(element: HTMLElement | SVGElement, callback: () => void): StopHandle {
  const observer = useResizeObserver(element, () => callback());
  return () => observer.stop();
}
