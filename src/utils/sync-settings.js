import { warn } from './logger.ts';

const DEFAULTS = {
  pageSize: 50, // first-page size for initial UX
  maxHeaders: 500, // cap headers fetched per folder in background sync
  scope: 'all', // all folders (inbox prioritized)
  bodyLimit: 100, // number of bodies to prefetch when explicitly requested
};

export function getSyncSettings() {
  return {
    pageSize: DEFAULTS.pageSize,
    maxHeaders: DEFAULTS.maxHeaders,
    scope: DEFAULTS.scope,
    bodyLimit: DEFAULTS.bodyLimit,
  };
}

export function setSyncSettings(updates = {}) {
  // Sync settings are now hardcoded. This function is retained for backward compatibility.
  if (Object.keys(updates).length > 0) {
    warn('setSyncSettings: Sync settings are now hardcoded and cannot be changed');
  }
  return getSyncSettings();
}

/**
 * Select folders to sync based on scope.
 * scope:
 *  - "inbox": only INBOX
 *  - "core": inbox + starred/important + sent if present
 *  - "all": all folders (prioritize inbox)
 */
export function pickFoldersForScope(folders = [], scope = 'core') {
  const list = Array.isArray(folders) ? folders : [];
  if (!list.length) return [];

  const byName = (name) =>
    list.find((f) => (f.path || f.name || '').toLowerCase() === name.toLowerCase());

  const inbox = byName('inbox') || list.find((f) => (f.path || '').toUpperCase() === 'INBOX');
  const sent =
    byName('sent') ||
    byName('sent items') ||
    list.find((f) => (f.path || '').toLowerCase().includes('sent'));
  const starred =
    byName('starred') ||
    byName('important') ||
    list.find((f) => (f.path || '').toLowerCase().includes('flag'));

  const result = [];
  const add = (f) => {
    if (!f) return;
    const path = f.path || f.name;
    if (!path) return;
    if (result.some((r) => r.path === path)) return;
    result.push({ path, name: f.name || path });
  };

  add(inbox);
  if (scope === 'inbox') return result;

  add(starred);
  add(sent);

  if (scope === 'all') {
    list.forEach((f) => add(f));
  }

  return result;
}
