import { Local } from './storage.js';
import { getEffectiveSettingValue } from '../stores/settingsStore';

export const getSentFolderPreference = (account = null) => {
  const accountId = account || Local.get('email') || 'default';
  return getEffectiveSettingValue('sent_folder', { account: accountId }) || '';
};

// Ordered by priority — prefer specific names over bare "Sent"
// (e.g. Gmail uses "Sent Mail", Outlook uses "Sent Items")
const SENT_NAMES_PRIORITY = ['SENT MAIL', 'SENT ITEMS', 'SENT'];

/**
 * Resolve the best sent folder path.
 * Priority: user preference > specialUse flag > folder name match > 'Sent' fallback.
 * @param {string|null} account - Account identifier
 * @param {Array|null} folderList - Optional list of folder objects to search
 */
export const resolveSentFolder = (account = null, folderList = null) => {
  const preferred = getSentFolderPreference(account);
  if (preferred) return preferred;

  if (Array.isArray(folderList) && folderList.length) {
    // Strongest signal: IMAP specialUse flag
    const specialUseMatch = folderList.find((f) => f.specialUse === '\\Sent');
    if (specialUseMatch) return specialUseMatch.path;

    // Name-based detection — check most-specific names first
    for (const sentName of SENT_NAMES_PRIORITY) {
      const match = folderList.find((f) => {
        const p = (f.path || '').toUpperCase();
        const n = (f.name || '').toUpperCase();
        return p === sentName || n === sentName;
      });
      if (match) return match.path;
    }
  }

  return 'Sent';
};
