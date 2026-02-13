import { Remote } from './remote.js';
import { Local } from './storage.js';
import { db } from './db';
import { resolveSentFolder } from './sent-folder.js';

export const buildSentCopyPayload = (emailPayload, account = null, folderList = null) => {
  const sentFolder = resolveSentFolder(account, folderList);
  return {
    from: emailPayload.from,
    to: emailPayload.to || [],
    cc: emailPayload.cc || [],
    bcc: emailPayload.bcc || [],
    replyTo: emailPayload.replyTo,
    inReplyTo: emailPayload.inReplyTo,
    subject: emailPayload.subject || '',
    html: emailPayload.html,
    text: emailPayload.text,
    attachments: emailPayload.attachments || [],
    has_attachment: emailPayload.has_attachment || false,
    folder: sentFolder,
    flags: ['\\Seen'],
  };
};

export const saveSentCopy = async (emailPayload, account = null, folderList = null) => {
  // If no folder list provided, read from IDB for better auto-detection
  let folders = folderList;
  if (!folders) {
    try {
      const acct = account || Local.get('email') || 'default';
      folders = await db.folders.where('account').equals(acct).toArray();
    } catch {
      // Fall through — resolveSentFolder will use 'Sent' fallback
    }
  }

  const payload = buildSentCopyPayload(emailPayload, account, folders);

  const response = await Remote.request('MessageCreate', payload, {
    method: 'POST',
    pathOverride: '/v1/messages',
  });

  return response;
};
