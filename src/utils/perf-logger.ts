import { Local } from './storage.js';

export interface PerfEventData {
  label?: string;
  duration?: number;
  stages?: PerfStage[];
  [key: string]: unknown;
}

export interface PerfStage {
  name: string;
  t: number;
  [key: string]: unknown;
}

export interface PerfTracer {
  stage(name: string, extra?: Record<string, unknown>): void;
  end(extra?: Record<string, unknown>): void;
}

function perfEnabled(): boolean {
  try {
    return Local.get('debug_perf') === '1';
  } catch {
    return false;
  }
}

export function logPerfEvent(label: string, data: Record<string, unknown> = {}): void {
  if (!perfEnabled()) return;
  const payload = { label, ...data };
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    window.dispatchEvent(new CustomEvent('fe-perf', { detail: payload }));
  }
}

export function createPerfTracer(label: string, meta: Record<string, unknown> = {}): PerfTracer {
  if (!perfEnabled() || typeof performance === 'undefined') {
    const noop: PerfTracer = { stage: () => {}, end: () => {} };
    return noop;
  }

  const start = performance.now();
  const stages: PerfStage[] = [];
  const base = { label, ...meta };

  return {
    stage(name: string, extra: Record<string, unknown> = {}): void {
      stages.push({ name, t: performance.now(), ...extra });
    },
    end(extra: Record<string, unknown> = {}): void {
      const end = performance.now();
      const duration = end - start;
      logPerfEvent(label, { ...base, duration, stages, ...extra });
    },
  };
}

let longTaskObserver: PerformanceObserver | null = null;

export function initPerfObservers(): void {
  if (longTaskObserver || typeof PerformanceObserver === 'undefined') {
    return;
  }
  if (!perfEnabled()) return;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      if (!perfEnabled()) return;
      const entries = list.getEntries() || [];
      entries.forEach((entry) => {
        logPerfEvent('longtask', {
          duration: entry.duration,
          startTime: entry.startTime,
          name: entry.name,
          entryType: entry.entryType,
        });
      });
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    // No longtask support in this environment
  }
}
