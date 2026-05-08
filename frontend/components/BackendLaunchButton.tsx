"use client";

import { useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

type BackendLaunchButtonProps = {
  href: string;
  requiresBackend?: boolean;
};

type LaunchState = "idle" | "loading" | "error";

const POLL_INTERVAL_MS = 2500;
const BACKEND_TIMEOUT_MS = 90000;

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
    setMessage("Waking up the backend...");

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4">
          <div className="w-full max-w-md border-2 border-ink bg-paperLight p-5 text-ink shadow-hard">
            <p className="font-mono text-xs uppercase text-rule">backend</p>
            <h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal">
              {state === "loading" ? "Loading" : "Could not start"}
            </h2>
            <p className="mt-4 text-sm leading-6">{message}</p>
            <div className="mt-6 flex gap-3">
              {state === "loading" ? (
                <button
                  type="button"
                  onClick={cancelLaunch}
                  className="border-2 border-ink bg-paper px-4 py-2 font-mono text-xs uppercase text-ink hover:bg-brass"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setState("idle")}
                  className="border-2 border-ink bg-soot px-4 py-2 font-mono text-xs uppercase text-paper hover:bg-brass hover:text-ink"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

async function waitForBackend(signal: AbortSignal) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < BACKEND_TIMEOUT_MS) {
    try {
      const response = await fetch(apiUrl("/api/health"), {
        cache: "no-store",
        signal,
      });

      if (response.ok) {
        const body = (await response.json()) as { ok?: boolean };
        if (body.ok) {
          return;
        }
      }
    } catch {
      // Render may still be waking up. Keep polling until timeout or cancel.
    }

    await sleep(POLL_INTERVAL_MS, signal);
  }

  throw new Error("The backend is taking longer than expected. Try again in a moment.");
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);

    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Launch canceled.", "AbortError"));
      },
      { once: true },
    );
  });
}
