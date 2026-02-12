import { vi } from 'vitest';
import { Remote } from '../../src/utils/remote.js';

/**
 * Install a Remote.request mock for Vitest.
 * @param {Record<string, any|Function>} handlers - map of action -> response or handler({action, params, options})
 */
export function installRemoteMock(handlers = {}) {
  const spy = vi
    .spyOn(Remote, 'request')
    .mockImplementation(async (action, params = {}, options = {}) => {
      const handler = handlers[action] ?? handlers.default;
      if (typeof handler === 'function') {
        return handler({ action, params, options });
      }
      if (handler !== undefined) return handler;
      return { Result: {} };
    });

  return {
    spy,
    restore: () => spy.mockRestore(),
  };
}
