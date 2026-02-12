import { dedupeAddresses } from './address';

const decodeMailtoValue = (value = '') => {
  if (!value) return '';
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  } catch {
    return String(value);
  }
};

const splitAddressList = (value = '') =>
  decodeMailtoValue(value)
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);

export const parseMailto = (input = '') => {
  const result = {
    to: [],
    cc: [],
    bcc: [],
    subject: '',
    body: '',
    replyTo: '',
    inReplyTo: '',
    raw: input || '',
    other: {},
  };

  if (!input) return result;
  const raw = String(input).trim();
  const normalized = raw.toLowerCase().startsWith('mailto:') ? raw.slice(7) : raw;

  const queryIndex = normalized.indexOf('?');
  const addressPart = queryIndex === -1 ? normalized : normalized.slice(0, queryIndex);
  const queryPart = queryIndex === -1 ? '' : normalized.slice(queryIndex + 1);

  if (addressPart) {
    result.to.push(...splitAddressList(addressPart));
  }

  const params = new URLSearchParams(queryPart);
  params.forEach((value, key) => {
    const lower = String(key).toLowerCase();
    if (lower === 'to') {
      result.to.push(...splitAddressList(value));
      return;
    }
    if (lower === 'cc') {
      result.cc.push(...splitAddressList(value));
      return;
    }
    if (lower === 'bcc') {
      result.bcc.push(...splitAddressList(value));
      return;
    }
    if (lower === 'subject') {
      result.subject = result.subject || decodeMailtoValue(value);
      return;
    }
    if (lower === 'body') {
      const next = decodeMailtoValue(value);
      result.body = result.body ? `${result.body}\n${next}` : next;
      return;
    }
    if (lower === 'reply-to' || lower === 'replyto') {
      result.replyTo = result.replyTo || decodeMailtoValue(value);
      return;
    }
    if (lower === 'in-reply-to' || lower === 'inreplyto') {
      result.inReplyTo = result.inReplyTo || decodeMailtoValue(value);
      return;
    }
    if (!result.other[lower]) result.other[lower] = [];
    result.other[lower].push(decodeMailtoValue(value));
  });

  result.to = dedupeAddresses(result.to);
  result.cc = dedupeAddresses(result.cc);
  result.bcc = dedupeAddresses(result.bcc);

  return result;
};

export const mailtoToPrefill = (parsed = {}) => {
  const body = parsed.body || '';
  return {
    to: parsed.to || [],
    cc: parsed.cc || [],
    bcc: parsed.bcc || [],
    subject: parsed.subject || '',
    text: body,
    body,
    replyTo: parsed.replyTo || '',
    inReplyTo: parsed.inReplyTo || '',
    mailto: parsed,
  };
};
