import { Remote } from './remote.js';
import { resolveSentFolder } from './sent-folder.js';

export const buildSentCopyPayload = (emailPayload, account = null) => {
  const sentFolder = resolveSentFolder(account);
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

export const saveSentCopy = async (emailPayload, account = null) => {
  const payload = buildSentCopyPayload(emailPayload, account);

  const response = await Remote.request('MessageCreate', payload, {
    method: 'POST',
    pathOverride: '/v1/messages',
  });

  return response;
};
