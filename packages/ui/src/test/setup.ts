import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {}

  send = vi.fn();
  close = vi.fn(() => {
    this.onclose?.();
  });
}

vi.stubGlobal("WebSocket", MockWebSocket);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
