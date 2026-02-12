/**
 * Attachment Reminder Utility
 *
 * Detects attachment-related keywords in email compose content and alerts
 * users if they mention attachments but haven't added any files.
 *
 * Key features:
 * - Multi-language keyword detection (based on SPECIFICATION.md Appendix E)
 * - Excludes quoted/forwarded content (only checks user's new text)
 * - Case-insensitive matching
 */

/**
 * Attachment keywords by language
 * Based on SPECIFICATION.md Appendix E with additional common variations
 */
const ATTACHMENT_KEYWORDS = {
  en: [
    'attach',
    'attached',
    'attachment',
    'attachments',
    'attaching',
    'enclosed',
    'enclosure',
    'see attached',
    'find attached',
    'please find attached',
    'i have attached',
    "i've attached",
    'file attached',
    'files attached',
  ],
  es: [
    'adjunto',
    'adjuntar',
    'adjuntado',
    'adjuntos',
    'archivo adjunto',
    'te adjunto',
    'le adjunto',
  ],
  fr: [
    'pièce jointe',
    'pièces jointes',
    'ci-joint',
    'joint',
    'joindre',
    'fichier joint',
    'en pièce jointe',
    'vous trouverez ci-joint',
  ],
  de: [
    'anhang',
    'anhänge',
    'angehängt',
    'anbei',
    'beigefügt',
    'datei anhang',
    'im anhang',
    'siehe anhang',
  ],
  it: ['allegato', 'allegati', 'in allegato', 'allegare', 'file allegato', 'trovi in allegato'],
  pt: ['anexo', 'anexos', 'anexado', 'em anexo', 'arquivo anexo', 'segue anexo', 'segue em anexo'],
  nl: ['bijlage', 'bijlagen', 'bijgevoegd', 'bijgesloten', 'bestand bijlage', 'in bijlage'],
  ru: [
    'вложение',
    'вложения',
    'прикреплен',
    'прикреплено',
    'прикрепленный',
    'файл вложен',
    'во вложении',
  ],
  zh: ['附件', '附上', '附加', '附档', '请查收附件'],
  ja: ['添付', '添付ファイル', '添付する', '添付します', 'ファイルを添付'],
  ko: ['첨부', '첨부파일', '첨부합니다', '첨부했습니다'],
  pl: ['załącznik', 'załączniki', 'w załączeniu', 'załączam', 'przesyłam w załączeniu'],
  tr: ['ek', 'ekte', 'ekli', 'ekliyorum', 'ekte bulabilirsiniz'],
  ar: ['مرفق', 'المرفق', 'ملف مرفق', 'في المرفق'],
  he: ['מצורף', 'קובץ מצורף', 'מצורפים'],
};

/**
 * Extract only user-composed content from HTML, excluding:
 * - Quoted reply content (<blockquote class="fe-reply-quote">)
 * - Reply attribution lines (<p class="fe-reply-attribution">)
 * - Forwarded message content (after <hr> separator)
 *
 * @param {string} html - The full HTML content from the editor
 * @returns {string} Plain text of only user-composed content
 */
export function extractUserContent(html) {
  if (!html || typeof html !== 'string') return '';

  // Use DOMParser to parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove reply quotes
  doc.querySelectorAll('blockquote.fe-reply-quote, .fe-reply-quote').forEach((el) => el.remove());

  // Remove reply attribution
  doc
    .querySelectorAll('p.fe-reply-attribution, .fe-reply-attribution')
    .forEach((el) => el.remove());

  // Remove forwarded content (everything after <hr>)
  const hrs = doc.querySelectorAll('hr');
  hrs.forEach((hr) => {
    // Remove all siblings after the <hr>
    let sibling = hr.nextSibling;
    while (sibling) {
      const next = sibling.nextSibling;
      sibling.remove();
      sibling = next;
    }
    // Remove the <hr> itself
    hr.remove();
  });

  // Also handle generic blockquotes that might be quoted content
  // Be careful not to remove user-intentional blockquotes
  // Only remove if it looks like quoted email content (starts with >)
  doc.querySelectorAll('blockquote').forEach((el) => {
    const text = el.textContent || '';
    // If the blockquote content appears to be email quoting (lines start with >)
    // or it's the only content after attribution, remove it
    if (
      text.trim().startsWith('>') ||
      el.previousElementSibling?.classList?.contains('fe-reply-attribution')
    ) {
      el.remove();
    }
  });

  // Get plain text content
  return doc.body?.textContent || '';
}

/**
 * Check if text contains any attachment-related keywords
 *
 * @param {string} text - Text to check (should be user content only)
 * @param {string[]} [languages] - Languages to check (defaults to all)
 * @returns {{ found: boolean, keyword: string | null, language: string | null }}
 */
export function detectAttachmentKeywords(text, languages = null) {
  if (!text || typeof text !== 'string') {
    return { found: false, keyword: null, language: null };
  }

  const lowerText = text.toLowerCase();

  // Determine which languages to check
  const langsToCheck = languages || Object.keys(ATTACHMENT_KEYWORDS);

  for (const lang of langsToCheck) {
    const keywords = ATTACHMENT_KEYWORDS[lang];
    if (!keywords) continue;

    for (const keyword of keywords) {
      // Use word boundary matching for most keywords
      // For non-Latin scripts (zh, ja, ko, ar, he), just check for presence
      const isNonLatin = ['zh', 'ja', 'ko', 'ar', 'he'].includes(lang);

      if (isNonLatin) {
        if (lowerText.includes(keyword.toLowerCase())) {
          return { found: true, keyword, language: lang };
        }
      } else {
        // Create word boundary regex for Latin scripts
        // This prevents matching "attachment" inside "reattachment" etc.
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(text)) {
          return { found: true, keyword, language: lang };
        }
      }
    }
  }

  return { found: false, keyword: null, language: null };
}

/**
 * Check if an email should show an attachment reminder
 *
 * @param {Object} options
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body HTML
 * @param {Array} options.attachments - Current attachments array
 * @param {string[]} [options.languages] - Languages to check (defaults to all)
 * @returns {{ shouldRemind: boolean, keyword: string | null, source: 'subject' | 'body' | null }}
 */
export function shouldShowAttachmentReminder({ subject, body, attachments, languages = null }) {
  // If there are already attachments, no reminder needed
  if (attachments && attachments.length > 0) {
    return { shouldRemind: false, keyword: null, source: null };
  }

  // Check subject first
  const subjectResult = detectAttachmentKeywords(subject || '', languages);
  if (subjectResult.found) {
    return { shouldRemind: true, keyword: subjectResult.keyword, source: 'subject' };
  }

  // Extract only user-composed content from body
  const userContent = extractUserContent(body || '');

  // Check user content
  const bodyResult = detectAttachmentKeywords(userContent, languages);
  if (bodyResult.found) {
    return { shouldRemind: true, keyword: bodyResult.keyword, source: 'body' };
  }

  return { shouldRemind: false, keyword: null, source: null };
}

/**
 * Get supported language codes
 * @returns {string[]} Array of supported language codes
 */
export function getSupportedLanguages() {
  return Object.keys(ATTACHMENT_KEYWORDS);
}

/**
 * Get keywords for a specific language
 * @param {string} langCode - Language code (e.g., 'en', 'es')
 * @returns {string[]} Keywords for that language, or empty array if not found
 */
export function getKeywordsForLanguage(langCode) {
  return ATTACHMENT_KEYWORDS[langCode] || [];
}

export default {
  extractUserContent,
  detectAttachmentKeywords,
  shouldShowAttachmentReminder,
  getSupportedLanguages,
  getKeywordsForLanguage,
};
