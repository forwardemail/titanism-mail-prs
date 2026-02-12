import { Local } from './storage.js';
import { getEffectiveSettingValue } from '../stores/settingsStore';

export const getSentFolderPreference = (account = null) => {
  const accountId = account || Local.get('email') || 'default';
  return getEffectiveSettingValue('sent_folder', { account: accountId }) || '';
};

export const resolveSentFolder = (account = null) => {
  const preferred = getSentFolderPreference(account);
  return preferred || 'Sent';
};
