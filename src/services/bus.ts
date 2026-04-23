type Handler = (data: unknown) => void;

const listeners: Handler[] = [];

export function on(handler: Handler): () => void {
  listeners.push(handler);
  return () => {
    const idx = listeners.indexOf(handler);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function emit(data: unknown): void {
  for (const cb of listeners) {
    try {
      cb(data);
    } catch (err) {
      // isolate listener failures
      console.warn("[BUS] listener error:", (err as Error).message);
    }
  }
}
