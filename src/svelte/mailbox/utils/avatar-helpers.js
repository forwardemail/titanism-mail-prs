import {
  extractAddressList,
  displayAddresses,
  extractDisplayName,
} from '../../../utils/address.ts';

/**
 * Get display name from message's "from" field
 * @param {Object} message - Message object
 * @returns {string} Display name or email
 */
export const getFromDisplay = (message) => {
  if (!message) return '';
  const list = extractAddressList(message, 'from');
  const display = displayAddresses(list).join(', ');
  return display || message.from || message.From || '';
};

/**
 * Get display name from conversation's latest message
 * @param {Object} conv - Conversation object
 * @returns {string} Display name or email
 */
export const getConversationFromDisplay = (conv) => {
  if (!conv) return '';
  const latest = Array.isArray(conv.messages) ? conv.messages[conv.messages.length - 1] : null;
  const display = getFromDisplay(latest);
  return display || conv.latestFrom || conv.from || '';
};

/**
 * Get display name (no email) from conversation
 * @param {Object} conv - Conversation object
 * @returns {string} Display name only
 */
export const getConversationFromName = (conv) =>
  extractDisplayName(getConversationFromDisplay(conv));

/**
 * Get display name (no email) from message
 * @param {Object} msg - Message object
 * @returns {string} Display name only
 */
export const getMessageFromName = (msg) => extractDisplayName(getFromDisplay(msg));

/**
 * Get initials from email sender
 * @param {string} from - From field (name or email)
 * @returns {string} Two-character initials
 */
export const getInitials = (from) => {
  if (!from) return '??';
  const displayName = extractDisplayName(from);

  // If it's just an email, use first two letters
  if (displayName.includes('@')) {
    return displayName.substring(0, 2).toUpperCase();
  }

  // If it's a name, get initials from first and last name
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Single word name - take first two letters
  return displayName.substring(0, 2).toUpperCase();
};

/**
 * Get initials from profile name
 * @param {string} name - Profile name
 * @returns {string} Two-character initials
 */
export const getProfileInitials = (name) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return trimmed.substring(0, 2).toUpperCase();
};

/**
 * Generate consistent avatar color based on sender email
 * @param {string} from - From field (email or name)
 * @returns {string} Hex color code
 */
export const getAvatarColor = (from) => {
  if (!from) return '#6b7280';

  const colors = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#84cc16',
    '#10b981',
    '#14b8a6',
    '#06b6d4',
    '#0ea5e9',
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#d946ef',
    '#ec4899',
    '#f43f5e',
  ];

  // Simple hash function for consistent color
  let hash = 0;
  for (let i = 0; i < from.length; i++) {
    hash = (hash << 5) - hash + from.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  return colors[Math.abs(hash) % colors.length];
};
