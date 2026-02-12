import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * Unit tests for CID (Content-ID) attachment resolution
 * Tests inline image embedding functionality
 */

// Mock the helper functions from mailService
const escapeRegExp = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const isBase64String = (str) => {
  if (typeof str !== 'string' || str.length === 0) {
    return false;
  }
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(str) && str.length % 4 === 0;
};

// Simplified version of applyInlineAttachments for testing
const applyInlineAttachments = (body, attachments = []) => {
  if (!body || typeof body !== 'string') {
    return body || '';
  }

  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return body;
  }

  let result = body;
  const blobUrls = new Set();

  for (const att of attachments) {
    if (!att.contentId) {
      continue;
    }

    let content = att.content;
    if (!content) {
      continue;
    }

    try {
      let blob;

      if (typeof content === 'string') {
        if (content.startsWith('data:')) {
          const cidPattern = new RegExp(
            `cid:${escapeRegExp(att.contentId.replace(/[<>]/g, ''))}`,
            'gi',
          );
          result = result.replace(cidPattern, content);
          continue;
        } else if (isBase64String(content)) {
          const binaryString = atob(content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          blob = new Blob([bytes], { type: att.contentType || 'application/octet-stream' });
        } else {
          blob = new Blob([content], { type: att.contentType || 'text/plain' });
        }
      } else if (content instanceof ArrayBuffer || content instanceof Uint8Array) {
        blob = new Blob([content], { type: att.contentType || 'application/octet-stream' });
      } else {
        continue;
      }

      const blobUrl = URL.createObjectURL(blob);
      blobUrls.add(blobUrl);

      const contentId = att.contentId.replace(/[<>]/g, '');
      const cidPattern = new RegExp(`cid:${escapeRegExp(contentId)}`, 'gi');
      result = result.replace(cidPattern, blobUrl);
    } catch (err) {
      console.error('Failed to create blob URL:', err);
    }
  }

  return result;
};

describe('CID Attachment Resolution', () => {
  beforeEach(() => {
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => `blob:mock-url-${Math.random()}`);
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic CID Resolution', () => {
    it('should replace single cid reference with blob URL', () => {
      const html = '<html><body><img src="cid:image001"></body></html>';
      const attachments = [
        {
          contentId: '<image001>',
          contentType: 'image/png',
          content: new Uint8Array([1, 2, 3, 4]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).not.toContain('cid:image001');
      expect(result).toContain('blob:mock-url-');
      expect(global.URL.createObjectURL).toHaveBeenCalledOnce();
    });

    it('should handle Content-ID with angle brackets', () => {
      const html = '<img src="cid:test@example.com">';
      const attachments = [
        {
          contentId: '<test@example.com>',
          contentType: 'image/jpeg',
          content: new Uint8Array([255, 216, 255]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).not.toContain('cid:test@example.com');
      expect(result).toContain('blob:');
    });

    it('should handle Content-ID without angle brackets', () => {
      const html = '<img src="cid:test@example.com">';
      const attachments = [
        {
          contentId: 'test@example.com',
          contentType: 'image/jpeg',
          content: new Uint8Array([255, 216, 255]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).not.toContain('cid:test@example.com');
      expect(result).toContain('blob:');
    });
  });

  describe('Multiple CID References', () => {
    it('should replace multiple different cid references', () => {
      const html = `
        <html>
          <body>
            <img src="cid:image1">
            <img src="cid:image2">
            <img src="cid:image3">
          </body>
        </html>
      `;
      const attachments = [
        { contentId: '<image1>', contentType: 'image/png', content: new Uint8Array([1]) },
        { contentId: '<image2>', contentType: 'image/jpeg', content: new Uint8Array([2]) },
        { contentId: '<image3>', contentType: 'image/gif', content: new Uint8Array([3]) },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).not.toContain('cid:image1');
      expect(result).not.toContain('cid:image2');
      expect(result).not.toContain('cid:image3');
      expect(global.URL.createObjectURL).toHaveBeenCalledTimes(3);
    });

    it('should replace same cid referenced multiple times', () => {
      const html = `
        <html>
          <body>
            <img src="cid:logo">
            <img src="cid:logo">
          </body>
        </html>
      `;
      const attachments = [
        {
          contentId: '<logo>',
          contentType: 'image/png',
          content: new Uint8Array([1, 2, 3]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      // Should replace both instances with the same blob URL
      expect(result).not.toContain('cid:logo');
      const matches = result.match(/blob:mock-url-/g);
      expect(matches).toHaveLength(2);
    });
  });

  describe('Content Type Handling', () => {
    it('should handle ArrayBuffer content', () => {
      const html = '<img src="cid:test">';
      const buffer = new ArrayBuffer(4);
      const view = new Uint8Array(buffer);
      view[0] = 1;
      view[1] = 2;
      view[2] = 3;
      view[3] = 4;

      const attachments = [
        {
          contentId: '<test>',
          contentType: 'image/png',
          content: buffer,
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).toContain('blob:');
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'image/png',
        }),
      );
    });

    it('should handle Uint8Array content', () => {
      const html = '<img src="cid:test">';
      const attachments = [
        {
          contentId: '<test>',
          contentType: 'image/jpeg',
          content: new Uint8Array([255, 216, 255, 224]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).toContain('blob:');
    });

    it('should handle base64 string content', () => {
      const html = '<img src="cid:test">';
      // Base64 for a small PNG
      const base64Content =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const attachments = [
        {
          contentId: '<test>',
          contentType: 'image/png',
          content: base64Content,
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).toContain('blob:');
    });

    it('should handle data URL content directly', () => {
      const html = '<img src="cid:test">';
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

      const attachments = [
        {
          contentId: '<test>',
          contentType: 'image/png',
          content: dataUrl,
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      // Should use data URL directly, not create blob
      expect(result).toContain(dataUrl);
      expect(result).not.toContain('blob:');
    });

    it('should handle plain text content', () => {
      const html = '<img src="cid:test">';
      const attachments = [
        {
          contentId: '<test>',
          contentType: 'text/plain',
          content: 'not base64 content',
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).toContain('blob:');
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'text/plain',
        }),
      );
    });
  });

  describe('Edge Cases', () => {
    it('should return original body if no attachments', () => {
      const html = '<img src="cid:test">';
      const result = applyInlineAttachments(html, []);

      expect(result).toBe(html);
    });

    it('should return original body if attachments is not an array', () => {
      const html = '<img src="cid:test">';
      const result = applyInlineAttachments(html, null);

      expect(result).toBe(html);
    });

    it('should skip attachments without contentId', () => {
      const html = '<img src="cid:test">';
      const attachments = [
        {
          contentType: 'image/png',
          content: new Uint8Array([1, 2, 3]),
          // no contentId
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).toBe(html);
      expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('should skip attachments without content', () => {
      const html = '<img src="cid:test">';
      const attachments = [
        {
          contentId: '<test>',
          contentType: 'image/png',
          // no content
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).toBe(html);
      expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('should handle empty body', () => {
      const result = applyInlineAttachments('', []);
      expect(result).toBe('');
    });

    it('should handle null body', () => {
      const result = applyInlineAttachments(null, []);
      expect(result).toBe('');
    });

    it('should handle undefined body', () => {
      const result = applyInlineAttachments(undefined, []);
      expect(result).toBe('');
    });
  });

  describe('Special Characters in Content-ID', () => {
    it('should handle Content-ID with special regex characters', () => {
      const html = '<img src="cid:image.test+123@example.com">';
      const attachments = [
        {
          contentId: '<image.test+123@example.com>',
          contentType: 'image/png',
          content: new Uint8Array([1, 2, 3]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).not.toContain('cid:image.test+123@example.com');
      expect(result).toContain('blob:');
    });

    it('should be case-insensitive when replacing cid references', () => {
      const html = '<img src="CID:Test123">';
      const attachments = [
        {
          contentId: '<test123>',
          contentType: 'image/png',
          content: new Uint8Array([1, 2, 3]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).not.toContain('CID:Test123');
      expect(result).toContain('blob:');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle email signature with logo', () => {
      const html = `
        <html>
          <body>
            <p>Best regards,</p>
            <p>John Doe</p>
            <img src="cid:company-logo@example.com" alt="Company Logo">
          </body>
        </html>
      `;
      const attachments = [
        {
          contentId: '<company-logo@example.com>',
          contentType: 'image/png',
          filename: 'logo.png',
          content: new Uint8Array([137, 80, 78, 71]), // PNG header
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).toContain('alt="Company Logo"');
      expect(result).not.toContain('cid:company-logo@example.com');
      expect(result).toContain('blob:');
    });

    it('should handle newsletter with multiple images', () => {
      const html = `
        <html>
          <body>
            <img src="cid:header-banner">
            <p>Content here</p>
            <img src="cid:product-image-1">
            <img src="cid:product-image-2">
            <img src="cid:footer-logo">
          </body>
        </html>
      `;
      const attachments = [
        {
          contentId: '<header-banner>',
          contentType: 'image/jpeg',
          content: new Uint8Array([255, 216]),
        },
        {
          contentId: '<product-image-1>',
          contentType: 'image/jpeg',
          content: new Uint8Array([255, 216]),
        },
        {
          contentId: '<product-image-2>',
          contentType: 'image/jpeg',
          content: new Uint8Array([255, 216]),
        },
        {
          contentId: '<footer-logo>',
          contentType: 'image/png',
          content: new Uint8Array([137, 80]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).not.toContain('cid:header-banner');
      expect(result).not.toContain('cid:product-image-1');
      expect(result).not.toContain('cid:product-image-2');
      expect(result).not.toContain('cid:footer-logo');
      expect(global.URL.createObjectURL).toHaveBeenCalledTimes(4);
    });

    it('should handle mixed regular and inline attachments', () => {
      const html = '<img src="cid:inline-image">';
      const attachments = [
        {
          contentId: '<inline-image>',
          contentType: 'image/png',
          disposition: 'inline',
          content: new Uint8Array([1, 2, 3]),
        },
        {
          // Regular attachment without Content-ID
          contentType: 'application/pdf',
          disposition: 'attachment',
          filename: 'document.pdf',
          content: new Uint8Array([37, 80, 68, 70]),
        },
      ];

      const result = applyInlineAttachments(html, attachments);

      expect(result).not.toContain('cid:inline-image');
      expect(result).toContain('blob:');
      // Only the inline image should create a blob URL
      expect(global.URL.createObjectURL).toHaveBeenCalledOnce();
    });
  });
});

describe('Helper Functions', () => {
  describe('escapeRegExp', () => {
    it('should escape special regex characters', () => {
      expect(escapeRegExp('test.png')).toBe('test\\.png');
      expect(escapeRegExp('image+123')).toBe('image\\+123');
      expect(escapeRegExp('test[1]')).toBe('test\\[1\\]');
      expect(escapeRegExp('a*b?c')).toBe('a\\*b\\?c');
    });
  });

  describe('isBase64String', () => {
    it('should identify valid base64 strings', () => {
      expect(isBase64String('SGVsbG8gV29ybGQh')).toBe(true);
      expect(isBase64String('AQIDBA==')).toBe(true);
      expect(isBase64String('YWJjZGVmZ2hpams=')).toBe(true);
    });

    it('should reject invalid base64 strings', () => {
      expect(isBase64String('not base64!')).toBe(false);
      expect(isBase64String('abc')).toBe(false); // Wrong length
      // Note: 'AB==' is actually valid base64 (length 4), just very short
      expect(isBase64String('')).toBe(false);
      expect(isBase64String('Hello World')).toBe(false);
    });

    it('should handle non-string inputs', () => {
      expect(isBase64String(null)).toBe(false);
      expect(isBase64String(undefined)).toBe(false);
      expect(isBase64String(123)).toBe(false);
    });
  });
});
