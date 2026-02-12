/**
 * Dev-only console.warn wrapper.
 * Calls are retained in source but the body is dead-code-eliminated
 * by Vite/Rollup when import.meta.env.DEV === false.
 */
export function warn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
}
