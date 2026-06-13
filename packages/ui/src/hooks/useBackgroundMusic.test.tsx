import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBackgroundMusic } from "./useBackgroundMusic";

class MockSocket {
  static instances: MockSocket[] = [];
  onmessage: ((ev: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 1;
  constructor(public url: string) {
    MockSocket.instances.push(this);
  }
  send() {}
  close() {}
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  MockSocket.instances = [];
  vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);
  // jsdom non implementa play(): stub che risolve.
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBackgroundMusic", () => {
  it("parte in pausa con un volume di default", () => {
    const { result } = renderHook(() => useBackgroundMusic());
    expect(result.current.playing).toBe(false);
    expect(result.current.volume).toBeGreaterThan(0);
    expect(result.current.muted).toBe(false);
  });

  it("setVolume aggiorna lo stato", () => {
    const { result } = renderHook(() => useBackgroundMusic());
    act(() => result.current.setVolume(0.2));
    expect(result.current.volume).toBeCloseTo(0.2);
  });

  it("applica un evento ui.control 'set' ricevuto dall'hub", () => {
    const { result } = renderHook(() => useBackgroundMusic());
    act(() => {
      MockSocket.instances[0].onopen?.();
      MockSocket.instances[0].emit({
        v: 1, type: "ui.control", target: "music", action: "set", value: 25,
      });
    });
    expect(result.current.volume).toBeCloseTo(0.25);
  });

  it("toggleMute inverte muted", () => {
    const { result } = renderHook(() => useBackgroundMusic());
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
  });

  it("ferma l'audio allo smontaggio", () => {
    const { unmount } = renderHook(() => useBackgroundMusic());
    unmount();
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});
