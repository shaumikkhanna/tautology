"use client";

import { useRef, useState } from "react";
import { BackendLoadingModal } from "@/components/BackendLoadingModal";
import { waitForBackend } from "@/lib/backendHealth";

type BackendLaunchButtonProps = {
  href: string;
  requiresBackend?: boolean;
};

type LaunchState = "idle" | "loading" | "error";

export function BackendLaunchButton({
  href,
  requiresBackend = false,
}: BackendLaunchButtonProps) {
  const [state, setState] = useState<LaunchState>("idle");
  const [message, setMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function handleLaunch() {
    if (!requiresBackend) {
      window.location.href = href;
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");
    setMessage("");

    try {
      await waitForBackend(controller.signal);
      window.location.href = href;
    } catch (error) {
      if (controller.signal.aborted) {
        setState("idle");
        setMessage("");
        return;
      }

      setState("error");
      setMessage(error instanceof Error ? error.message : "Backend did not respond.");
    } finally {
      abortRef.current = null;
    }
  }

  function cancelLaunch() {
    abortRef.current?.abort();
  }

  return (
    <>
      <button
        type="button"
        onClick={handleLaunch}
        className="border-2 border-ink bg-soot px-5 py-3 font-mono text-sm uppercase text-paper shadow-hard hover:bg-brass hover:text-ink"
      >
        Play
      </button>

      {state !== "idle" ? (
        <BackendLoadingModal
          errorMessage={message}
          onCancel={cancelLaunch}
          onClose={() => setState("idle")}
          state={state}
        />
      ) : null}
    </>
  );
}
