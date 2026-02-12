export const mapMessageToDoc = (msg = {}, bodyText = '') => ({
  id: msg.id,
  folder: msg.folder || '',
  subject: msg.subject || '',
  from: msg.from || '',
  to: msg.to || '',
  cc: msg.cc || '',
  snippet: msg.snippet || '',
  date: msg.date || msg.dateMs || '',
  body: bodyText || msg.body || msg.textContent || '',
  labels: msg.labels || msg.label_ids || msg.labelIds || [],
});
