import { useCallback, useEffect, useRef, useState } from "react";

const HUB_URL = "ws://127.0.0.1:7710";
const TRACK_SRC = "/soundtrack.mp3";
const RETRY_MS = 3000;
const DEFAULT_VOLUME = 0.4;

export type BackgroundMusic = {
  volume: number;
  muted: boolean;
  playing: boolean;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  togglePlay: () => void;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function useBackgroundMusic(): BackgroundMusic {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Crea e rilascia l'elemento audio. Creazione e teardown appaiati: corretto sotto
  // React StrictMode (mount→unmount→remount) e niente leak — l'audio si ferma all'unmount.
  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const audio = new Audio(TRACK_SRC);
    audio.loop = true;
    audio.volume = DEFAULT_VOLUME;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // Riflette volume/mute sull'elemento.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  // Autostart al primo gesto utente (policy autoplay del browser).
  useEffect(() => {
    const start = () => {
      play();
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [play]);

  // Ascolta i comandi ui.control dall'hub.
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(HUB_URL);
      socket.onopen = () => {
        socket?.send(JSON.stringify({ v: 1, type: "hello", role: "hud", client: "friday-ui-music" }));
      };
      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data?.type !== "ui.control" || data?.target !== "music") return;
          switch (data.action) {
            case "set":
              setVolumeState(clamp01(Number(data.value) / 100));
              break;
            case "mute":
              setMuted(true);
              break;
            case "unmute":
              setMuted(false);
              break;
            case "play":
              play();
              break;
            case "pause":
              pause();
              break;
          }
        } catch {
          // frame non-JSON: ignorato
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
      socket?.close();
    };
  }, [play, pause]);

  const setVolume = useCallback((value: number) => setVolumeState(clamp01(value)), []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const togglePlay = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  return { volume, muted, playing, setVolume, toggleMute, togglePlay };
}
