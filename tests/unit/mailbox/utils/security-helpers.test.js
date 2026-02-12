import { describe, it, expect } from 'vitest';
import {
  getMailedBy,
  getSignedBy,
  getSecurityInfo,
  formatSecurityStatus,
} from '../../../../src/svelte/mailbox/utils/security-helpers';

describe('security-helpers', () => {
  describe('getMailedBy', () => {
    it('extracts domain from received header', () => {
      const msg = {
        nodemailer: {
          headers: {
            received: 'from mail.example.com by mx.google.com with SMTP id abc123',
          },
        },
      };

      const result = getMailedBy(msg);

      expect(result).toBe('mx.google.com');
    });

    it('handles array of received headers', () => {
      const msg = {
        nodemailer: {
          headers: {
            received: [
              'from mail.example.com by mx.google.com with SMTP',
              'from another.com by relay.example.com',
            ],
          },
        },
      };

      const result = getMailedBy(msg);

      expect(result).toBe('mx.google.com');
    });

    it('falls back to DKIM signature domain', () => {
      const msg = {
        nodemailer: {
          headers: {
            'dkim-signature': {
              params: {
                d: 'example.com',
              },
            },
          },
        },
      };

      const result = getMailedBy(msg);

      expect(result).toBe('example.com');
    });

    it('returns null for message without headers', () => {
      expect(getMailedBy({})).toBeNull();
      expect(getMailedBy(null)).toBeNull();
    });

    it('returns null when no relevant headers found', () => {
      const msg = {
        nodemailer: {
          headers: {},
        },
      };

      expect(getMailedBy(msg)).toBeNull();
    });
  });

  describe('getSignedBy', () => {
    it('extracts DKIM signature domain', () => {
      const msg = {
        nodemailer: {
          headers: {
            'dkim-signature': {
              params: {
                d: 'example.com',
              },
            },
          },
        },
      };

      const result = getSignedBy(msg);

      expect(result).toBe('example.com');
    });

    it('returns null for message without DKIM', () => {
      const msg = {
        nodemailer: {
          headers: {},
        },
      };

      expect(getSignedBy(msg)).toBeNull();
    });

    it('returns null for message without headers', () => {
      expect(getSignedBy({})).toBeNull();
      expect(getSignedBy(null)).toBeNull();
    });
  });

  describe('getSecurityInfo', () => {
    it('parses SPF, DKIM, and DMARC from auth results', () => {
      const msg = {
        nodemailer: {
          headers: {
            'arc-authentication-results': 'spf=pass dkim=pass dmarc=pass',
            received: 'by mx.example.com with TLS version=TLSv1.3',
          },
        },
      };

      const result = getSecurityInfo(msg);

      expect(result).toEqual({
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
        encryption: 'TLSv1.3',
      });
    });

    it('handles partial authentication results', () => {
      const msg = {
        nodemailer: {
          headers: {
            'arc-authentication-results': 'spf=pass',
          },
        },
      };

      const result = getSecurityInfo(msg);

      expect(result).toEqual({
        spf: 'pass',
        dkim: null,
        dmarc: null,
        encryption: null,
      });
    });

    it('extracts TLS encryption version', () => {
      const msg = {
        nodemailer: {
          headers: {
            'arc-authentication-results': '',
            received: 'by mx.example.com (TLS version=TLSv1.2)',
          },
        },
      };

      const result = getSecurityInfo(msg);

      expect(result.encryption).toBe('TLSv1.2');
    });

    it('handles TLS without version', () => {
      const msg = {
        nodemailer: {
          headers: {
            'arc-authentication-results': '',
            received: 'by mx.example.com with TLS',
          },
        },
      };

      const result = getSecurityInfo(msg);

      expect(result.encryption).toBe('TLS');
    });

    it('handles array of received headers', () => {
      const msg = {
        nodemailer: {
          headers: {
            'arc-authentication-results': '',
            received: ['by mx.example.com with TLS version=TLSv1.3', 'by another.com'],
          },
        },
      };

      const result = getSecurityInfo(msg);

      expect(result.encryption).toBe('TLSv1.3');
    });

    it('returns null for message without auth results header', () => {
      const msg = {
        nodemailer: {
          headers: {},
        },
      };

      expect(getSecurityInfo(msg)).toBeNull();
    });

    it('returns null for message without headers', () => {
      expect(getSecurityInfo({})).toBeNull();
      expect(getSecurityInfo(null)).toBeNull();
    });
  });

  describe('formatSecurityStatus', () => {
    it('formats complete security info', () => {
      const securityInfo = {
        encryption: 'TLSv1.3',
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
      };

      const result = formatSecurityStatus(securityInfo);

      expect(result).toBe('Standard encryption (TLSv1.3) · SPF: Pass · DKIM: Pass · DMARC: Pass');
    });

    it('formats partial security info', () => {
      const securityInfo = {
        encryption: 'TLS',
        spf: 'pass',
        dkim: null,
        dmarc: null,
      };

      const result = formatSecurityStatus(securityInfo);

      expect(result).toBe('Standard encryption (TLS) · SPF: Pass');
    });

    it('capitalizes status values', () => {
      const securityInfo = {
        spf: 'fail',
        dkim: 'temperror',
        dmarc: 'permerror',
      };

      const result = formatSecurityStatus(securityInfo);

      expect(result).toBe('SPF: Fail · DKIM: Temperror · DMARC: Permerror');
    });

    it('returns "Unknown" for null security info', () => {
      expect(formatSecurityStatus(null)).toBe('Unknown');
      expect(formatSecurityStatus(undefined)).toBe('Unknown');
    });

    it('returns "Unknown" for empty security info', () => {
      const securityInfo = {
        encryption: null,
        spf: null,
        dkim: null,
        dmarc: null,
      };

      const result = formatSecurityStatus(securityInfo);

      expect(result).toBe('Unknown');
    });

    it('handles missing encryption', () => {
      const securityInfo = {
        encryption: null,
        spf: 'pass',
        dkim: 'pass',
      };

      const result = formatSecurityStatus(securityInfo);

      expect(result).toBe('SPF: Pass · DKIM: Pass');
    });
  });
});
