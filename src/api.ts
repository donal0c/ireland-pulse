import type { PulsePayload } from "./types";

export async function fetchPulse(): Promise<PulsePayload> {
  const response = await fetch("/api/pulse", {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Pulse API returned ${response.status}`);
  }

  return response.json();
}
