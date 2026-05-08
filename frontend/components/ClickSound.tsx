"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function ClickSound() {
  const pathname = usePathname();
  const audioContextRef = useRef<AudioContext | null>(null);
  const clickBufferRef = useRef<AudioBuffer | null>(null);
  const fallbackPoolRef = useRef<HTMLAudioElement[]>([]);
  const fallbackIndexRef = useRef(0);

  useEffect(() => {
    if (pathname.startsWith("/play/")) {
      return;
    }

    let isMounted = true;

    fallbackPoolRef.current = Array.from({ length: 5 }, () => {
      const audio = new Audio("/computer-click.mp3");
      audio.preload = "auto";
      audio.volume = 0.45;
      audio.load();
      return audio;
    });

    async function loadClickBuffer(context: AudioContext) {
      const response = await fetch("/computer-click.mp3");
      const bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);

      if (isMounted) {
        clickBufferRef.current = buffer;
      }
    }

    function getAudioContext() {
      if (!audioContextRef.current) {
        const AudioContextConstructor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

        if (AudioContextConstructor) {
          audioContextRef.current = new AudioContextConstructor({
            latencyHint: "interactive",
          });
          void loadClickBuffer(audioContextRef.current).catch(() => {});
        }
      }

      return audioContextRef.current;
    }

    function playFallback() {
      const pool = fallbackPoolRef.current;

      if (!pool.length) {
        return;
      }

      const audio = pool[fallbackIndexRef.current % pool.length];
      fallbackIndexRef.current += 1;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    }

    function playClick(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const context = getAudioContext();
      const buffer = clickBufferRef.current;

      if (!context || !buffer) {
        playFallback();
        return;
      }

      if (context.state === "suspended") {
        void context.resume();
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = 0.45;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      source.start();
    }

    window.addEventListener("pointerdown", playClick, { capture: true });

    return () => {
      isMounted = false;
      window.removeEventListener("pointerdown", playClick, { capture: true });
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      clickBufferRef.current = null;
      fallbackPoolRef.current = [];
    };
  }, [pathname]);

  return null;
}
