import { apiUrl } from "@/lib/api";

const POLL_INTERVAL_MS = 2500;
const BACKEND_TIMEOUT_MS = 90000;

export async function waitForBackend(signal: AbortSignal) {
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
