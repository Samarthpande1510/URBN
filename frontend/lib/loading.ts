// Global in-flight request tracker. api.ts increments this around every
// request; <GlobalLoader/> subscribes and shows a blocking overlay.
// Background polls wrap their calls in runSilent() so they don't flash the loader.

type Listener = (active: boolean) => void;

let count = 0;
let silentDepth = 0;
const listeners = new Set<Listener>();

function emit() {
  const active = count > 0;
  listeners.forEach((l) => l(active));
}

export function subscribeLoading(l: Listener): () => void {
  listeners.add(l);
  l(count > 0); // deliver current state immediately in case a request is already in flight
  return () => { listeners.delete(l); };
}

export function isSilent(): boolean {
  return silentDepth > 0;
}

export function startLoading() {
  count += 1;
  emit();
}

export function stopLoading() {
  count = Math.max(0, count - 1);
  emit();
}

/**
 * Run fn() without triggering the global loader for any requests it starts.
 * Relies on apiFetch reading isSilent() synchronously at call time (before its
 * first await), so the flag only needs to hold during fn's synchronous portion.
 */
export function runSilent<T>(fn: () => Promise<T>): Promise<T> {
  silentDepth += 1;
  try {
    return fn();
  } finally {
    silentDepth -= 1;
  }
}
