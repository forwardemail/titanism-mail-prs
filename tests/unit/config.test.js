import { afterEach, describe, expect, it, vi } from 'vitest';

const loadConfig = async () => {
  const module = await import('../../src/config.js');
  return module.config;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('config', () => {
  it('falls back to defaults when env vars are not set', async () => {
    const config = await loadConfig();
    expect(config.apiBase).toBe('https://api.forwardemail.net');
  });

  it('respects env overrides', async () => {
    vi.stubEnv('VITE_WEBMAIL_API_BASE', 'https://example.test');

    const config = await loadConfig();

    expect(config.apiBase).toBe('https://example.test');
  });
});
