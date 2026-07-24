declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export function event(name: string, properties: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  try {
    window.clarity?.('event', name, properties);
    window.gtag?.('event', name, properties);
  } catch {
    // Analytics must never interrupt studying.
  }
}
