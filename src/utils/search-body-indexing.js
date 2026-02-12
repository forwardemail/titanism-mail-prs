import { Local } from './storage.js';

export const resolveSearchBodyIndexing = () => {
  const stored = Local.get('search_body_indexing');
  if (stored !== null && stored !== undefined) {
    return stored === 'true' || stored === true;
  }
  const legacy = Local.get('include_body');
  if (legacy !== null && legacy !== undefined) {
    const next = legacy === 'true' || legacy === true;
    Local.set('search_body_indexing', next ? 'true' : 'false');
    return next;
  }
  return true;
};
