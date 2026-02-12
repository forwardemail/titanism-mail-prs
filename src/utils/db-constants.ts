const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

export const SCHEMA_VERSION = 1;
const baseName = isDev ? 'webmail-cache-dev' : 'webmail-cache';
let devSuffix = '';
if (isDev) {
  try {
    devSuffix = localStorage.getItem('webmail_db_suffix') || '';
  } catch {
    devSuffix = '';
  }
}
const suffix = devSuffix ? `-${devSuffix}` : '';
export const DB_NAME = `${baseName}-v${SCHEMA_VERSION}${suffix}`;

// HMR: When db-constants changes (especially SCHEMA_VERSION), force a full page reload
// Workers can't be hot-reloaded - they need to be recreated with new bundled code
// A full reload ensures workers get the new schema version
if (import.meta.hot && typeof window !== 'undefined') {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
