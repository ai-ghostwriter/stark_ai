import { useCallback, useEffect, useRef, useState } from "react";
import { RenderEvent } from "@stark-ai/contracts";

const HUB_URL = "ws://127.0.0.1:7710";
const RETRY_MS = 3000;

export type { RenderEvent };

export function useRenderEvents(): { event: RenderEvent | null; clear: () => void } {
  const [event, setEvent] = useState<RenderEvent | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    const connect = () => {
      const socket = new WebSocket(HUB_URL);
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ v: 1, type: "hello", role: "hud", client: "friday-ui-stage" }));
      };
      socket.onmessage = (message) => {
        try {
          const parsed = RenderEvent.safeParse(JSON.parse(String(message.data)));
          if (parsed.success) setEvent(parsed.data);
        } catch {
          // frame non-JSON dal hub: ignorato
        }
      };
      socket.onclose = () => {
        if (!disposed) timer = window.setTimeout(connect, RETRY_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      socketRef.current?.close();
    };
  }, []);

  const clear = useCallback(() => setEvent(null), []);
  return { event, clear };
}
