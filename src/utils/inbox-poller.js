import { get } from 'svelte/store';
import { mailboxStore } from '../stores/mailboxStore';
import { Local } from './storage';
import { startInitialSync } from './sync-controller';

const POLL_INTERVAL_MS = 10_000;

/**
 * TODO: Replace polling implementation with WebSocket-based real-time updates.
 * The WebSocket updater should implement the same InboxUpdater interface
 * (start/stop/destroy) and call the same store actions (loadMessages,
 * startInitialSync) on push notifications from the server.
 *
 * When ready, swap the factory:
 *   export function createInboxUpdater() {
 *     return createWebSocketUpdater();
 *   }
 */

/**
 * @typedef {Object} InboxUpdater
 * @property {() => void} start  - Begin monitoring for inbox updates
 * @property {() => void} stop   - Pause monitoring (resumable)
 * @property {() => void} destroy - Tear down completely (not resumable)
 */

/**
 * Factory — returns the active updater implementation.
 * @returns {InboxUpdater}
 */
export function createInboxUpdater() {
  return createPollingUpdater();
}

/**
 * Polling-based updater: fetches INBOX page 1 + lightweight metadata sync
 * on a fixed interval. Skips ticks when the tab is hidden or offline.
 */
function createPollingUpdater() {
  let timer = null;
  let destroyed = false;

  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    if (!navigator.onLine) return;

    const account = Local.get('email') || 'default';
    const currentFolder = get(mailboxStore.state.selectedFolder);

    // Only refresh automatically when viewing INBOX
    if (currentFolder !== 'INBOX') return;

    // loadMessages already deduplicates in-flight requests and guards
    // against stale accounts via the generation counter, so calling it
    // here is safe even if the user triggers a manual refresh at the
    // same moment.
    mailboxStore.actions.loadMessages();

    // Kick a lightweight metadata sync for INBOX so new arrivals on the
    // server get pulled into the local cache (uses since_modseq for
    // incremental diff).
    const folders = get(mailboxStore.state.folders) || [];
    const inbox = folders.find((f) => f.path?.toUpperCase?.() === 'INBOX');
    if (inbox) {
      startInitialSync(account, [inbox], { wantBodies: false });
    }
  };

  return {
    start() {
      if (destroyed || timer) return;
      timer = setInterval(tick, POLL_INTERVAL_MS);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    destroy() {
      this.stop();
      destroyed = true;
    },
  };
}
