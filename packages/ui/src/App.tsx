import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { AppShell } from "./components/AppShell/AppShell";
import { BootScreen } from "./components/BootScreen/BootScreen";
import styles from "./App.module.scss";

type TokenPayload = {
  token: string;
  url?: string;
};

type TokenState =
  | { status: "loading"; token: null; serverUrl: null; error: null }
  | { status: "ready"; token: string; serverUrl: string; error: null }
  | { status: "error"; token: null; serverUrl: null; error: string };

const roomName = import.meta.env.VITE_LIVEKIT_ROOM || "friday-room";
const identity = import.meta.env.VITE_LIVEKIT_IDENTITY || "ricky-stark";

async function requestToken(): Promise<TokenPayload> {
  const params = new URLSearchParams({ room: roomName, identity });
  const response = await fetch(`/token?${params.toString()}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Token request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<TokenPayload>;
}

export default function App() {
  const [tokenState, setTokenState] = useState<TokenState>({
    status: "loading",
    token: null,
    serverUrl: null,
    error: null
  });

  const loadToken = useCallback(() => {
    setTokenState({ status: "loading", token: null, serverUrl: null, error: null });
    requestToken()
      .then((payload) => {
        const serverUrl = payload.url || import.meta.env.VITE_LIVEKIT_URL;
        if (!payload.token || !serverUrl) {
          throw new Error("Token server response missing token or LiveKit URL.");
        }
        setTokenState({ status: "ready", token: payload.token, serverUrl, error: null });
      })
      .catch((error: unknown) => {
        setTokenState({
          status: "error",
          token: null,
          serverUrl: null,
          error: error instanceof Error ? error.message : "Token request failed."
        });
      });
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  if (tokenState.status === "loading") {
    return <BootScreen lines={["TOKEN HANDSHAKE", "LIVEKIT UPLINK", "FRIDAY BRIDGE"]} />;
  }

  if (tokenState.status === "error") {
    return (
      <div className={styles.errorScreen}>
        <div className={styles.errorCard}>
          <div className={styles.errorTitle}>CONNESSIONE NON DISPONIBILE</div>
          <p>{tokenState.error}</p>
          <button type="button" onClick={loadToken}>RIPROVA</button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={tokenState.serverUrl}
      token={tokenState.token}
      connect
      audio
      video={false}
      className={styles.room}
    >
      <FridayApp onReconnect={loadToken} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function FridayApp({ onReconnect }: { onReconnect: () => void }) {
  const connectionState = useConnectionState();
  const isBooting = useMemo(
    () =>
      connectionState === ConnectionState.Connecting ||
      connectionState === ConnectionState.Reconnecting,
    [connectionState]
  );

  if (isBooting) {
    return (
      <BootScreen
        lines={[
          "AUDIO BUS ONLINE",
          "AGENT SESSION SYNC",
          "JARVIS BRIDGE ATTIVO",
          "FRIDAY CORE INIZIALIZZATO"
        ]}
      />
    );
  }

  return <AppShell onReconnect={onReconnect} />;
}
