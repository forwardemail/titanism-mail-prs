/**
 * Extract "mailed-by" from received header or DKIM signature domain
 * @param {Object} msg - Message object with nodemailer headers
 * @returns {string|null} Mailed-by domain or null
 */
export const getMailedBy = (msg) => {
  if (!msg?.nodemailer?.headers) return null;
  const headers = msg.nodemailer.headers;

  // Try to get from received header - look for "by <domain>" pattern
  const received = headers.received;
  if (received) {
    const receivedStr = Array.isArray(received) ? received[0] : received;
    const byMatch = receivedStr?.match(/by\s+([^\s(]+)/i);
    if (byMatch) return byMatch[1];
  }

  // Fallback to DKIM signature domain
  const dkim = headers['dkim-signature'];
  if (dkim?.params?.d) return dkim.params.d;

  return null;
};

/**
 * Extract "signed-by" from DKIM signature domain
 * @param {Object} msg - Message object with nodemailer headers
 * @returns {string|null} DKIM signature domain or null
 */
export const getSignedBy = (msg) => {
  if (!msg?.nodemailer?.headers) return null;
  const dkim = msg.nodemailer.headers['dkim-signature'];
  if (dkim?.params?.d) return dkim.params.d;
  return null;
};

/**
 * Parse authentication-results headers for security info
 * @param {Object} msg - Message object with nodemailer headers
 * @returns {Object|null} Security info object with spf, dkim, dmarc, encryption
 */
export const getSecurityInfo = (msg) => {
  if (!msg?.nodemailer?.headers) return null;
  const headers = msg.nodemailer.headers;

  const results = { spf: null, dkim: null, dmarc: null, encryption: null };
  let hasAnyInfo = false;

  // Try arc-authentication-results first, then fall back to authentication-results
  let authResults = headers['arc-authentication-results'] || headers['authentication-results'];

  // Handle array of authentication results (multiple headers)
  if (Array.isArray(authResults)) {
    authResults = authResults.join(' ');
  }

  if (authResults) {
    // Parse SPF
    const spfMatch = authResults.match(/spf=(\w+)/i);
    if (spfMatch) {
      results.spf = spfMatch[1].toLowerCase();
      hasAnyInfo = true;
    }

    // Parse DKIM
    const dkimMatch = authResults.match(/dkim=(\w+)/i);
    if (dkimMatch) {
      results.dkim = dkimMatch[1].toLowerCase();
      hasAnyInfo = true;
    }

    // Parse DMARC
    const dmarcMatch = authResults.match(/dmarc=(\w+)/i);
    if (dmarcMatch) {
      results.dmarc = dmarcMatch[1].toLowerCase();
      hasAnyInfo = true;
    }
  }

  // Check for TLS in received header
  const received = headers.received;
  if (received) {
    const receivedStr = Array.isArray(received) ? received.join(' ') : received;
    if (receivedStr?.includes('TLS')) {
      const tlsMatch = receivedStr.match(/version=(TLSv[\d.]+)/i);
      results.encryption = tlsMatch ? tlsMatch[1] : 'TLS';
      hasAnyInfo = true;
    }
  }

  return hasAnyInfo ? results : null;
};

/**
 * Format security status for display
 * @param {Object} securityInfo - Security info object from getSecurityInfo
 * @returns {string} Formatted security status string
 */
export const formatSecurityStatus = (securityInfo) => {
  if (!securityInfo) return 'Unknown';
  const parts = [];

  if (securityInfo.encryption) {
    parts.push(`Standard encryption (${securityInfo.encryption})`);
  }

  // Show SPF, DKIM, DMARC results with proper capitalization
  if (securityInfo.spf) {
    const spfStatus = securityInfo.spf.charAt(0).toUpperCase() + securityInfo.spf.slice(1);
    parts.push(`SPF: ${spfStatus}`);
  }
  if (securityInfo.dkim) {
    const dkimStatus = securityInfo.dkim.charAt(0).toUpperCase() + securityInfo.dkim.slice(1);
    parts.push(`DKIM: ${dkimStatus}`);
  }
  if (securityInfo.dmarc) {
    const dmarcStatus = securityInfo.dmarc.charAt(0).toUpperCase() + securityInfo.dmarc.slice(1);
    parts.push(`DMARC: ${dmarcStatus}`);
  }

  return parts.length ? parts.join(' · ') : 'Unknown';
};
