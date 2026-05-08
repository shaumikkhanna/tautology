"use client";

import { useEffect, useRef } from "react";

export function ClickSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("/computer-click.mp3");
    audioRef.current.preload = "auto";
    audioRef.current.volume = 0.45;

    function playClick(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      audio.currentTime = 0;
      void audio.play().catch(() => {});
    }

    window.addEventListener("pointerdown", playClick, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", playClick, { capture: true });
      audioRef.current = null;
    };
  }, []);

  return null;
}
