import { readable, writable } from 'svelte/store';

/**
 * Executes an action when Enter or Space key is pressed
 * @param {KeyboardEvent} event - The keyboard event
 * @param {Function} action - The action to execute
 */
export const activateOnKeys = (event, action) => {
  if (event?.key === 'Enter' || event?.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    action?.();
  }
};

/**
 * Converts a value to a readable store, or creates a fallback store
 * @param {*} store - Potential store object
 * @param {*} fallback - Fallback value if store is invalid
 * @returns {Object} Readable store
 */
export const storeToStore = (store, fallback = null) =>
  store && typeof store.subscribe === 'function' ? store : readable(fallback, () => () => {});

/**
 * Converts a value to a writable store, or creates a fallback store
 * @param {*} store - Potential store object
 * @param {*} fallback - Fallback value if store is invalid
 * @returns {Object} Writable store
 */
export const storeToWritableStore = (store, fallback = null) =>
  store && typeof store.subscribe === 'function' ? store : writable(fallback);

/**
 * Chooses between two store candidates or creates a fallback readable store
 * @param {*} storeCandidate - Primary store candidate
 * @param {*} fallbackCandidate - Fallback store candidate
 * @param {*} fallback - Default fallback value
 * @returns {Object} Readable store
 */
export const chooseStore = (storeCandidate, fallbackCandidate, fallback = null) => {
  if (storeCandidate && typeof storeCandidate.subscribe === 'function') return storeCandidate;
  if (fallbackCandidate && typeof fallbackCandidate.subscribe === 'function') {
    return fallbackCandidate;
  }
  return readable(fallback, () => () => {});
};

/**
 * Chooses between two store candidates or creates a fallback writable store
 * @param {*} storeCandidate - Primary store candidate
 * @param {*} fallbackCandidate - Fallback store candidate
 * @param {*} fallback - Default fallback value
 * @returns {Object} Writable store
 */
export const chooseWritableStore = (storeCandidate, fallbackCandidate, fallback = null) => {
  if (storeCandidate && typeof storeCandidate.subscribe === 'function') return storeCandidate;
  if (fallbackCandidate && typeof fallbackCandidate.subscribe === 'function') {
    return fallbackCandidate;
  }
  return writable(fallback);
};

/**
 * Removes duplicate messages by ID
 * @param {Array} messages - Array of message objects
 * @returns {Array} Deduplicated array of messages
 */
export const dedupeMessages = (messages = []) => {
  const seen = new Set();
  return (messages || []).filter((msg) => {
    const id = msg?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

/**
 * Resolves delete targets from items (handles conversations with multiple messages)
 * @param {Array} items - Array of items (messages or conversations)
 * @returns {Array} Flat array of message objects
 */
export const resolveDeleteTargets = (items = []) =>
  dedupeMessages(
    (items || []).flatMap((item) => {
      if (!item) return [];
      if (item.messages?.length) return item.messages;
      return [item];
    }),
  );

/**
 * Returns the next candidate message/conversation for selection
 * @param {Object} options - Options object
 * @param {Array} options.list - List of conversations or messages
 * @param {boolean} options.threadingEnabled - Whether threading is enabled
 * @param {Object} options.selectedConversation - Currently selected conversation
 * @param {Object} options.selectedMessage - Currently selected message
 * @returns {Object|null} Next candidate item
 */
export const nextCandidate = ({
  list = [],
  threadingEnabled = false,
  selectedConversation = null,
  selectedMessage = null,
}) => {
  if (!list.length) return null;
  const currentId = threadingEnabled ? selectedConversation?.id : selectedMessage?.id;
  const idx = list.findIndex((item) => item.id === currentId);
  if (idx === -1) return list[0] || null;
  return list[idx + 1] || list[idx - 1] || null;
};
