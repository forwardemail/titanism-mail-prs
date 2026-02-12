import { db } from './db';
import { Local } from './storage';
import { warn } from './logger.ts';

/**
 * Attachment Blob Cache
 *
 * Caches downloaded attachment blobs in the IndexedDB `meta` table
 * for offline access. Manages quota to prevent unbounded growth.
 */

const ATTACHMENT_KEY_PREFIX = 'att_blob_';
const MANIFEST_KEY = 'att_cache_manifest';
const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB total
const MAX_SINGLE_BYTES = 5 * 1024 * 1024; // 5 MB per attachment

function getAccount() {
  return Local.get('email') || 'default';
}

function blobKey(account, messageId, filename) {
  return `${ATTACHMENT_KEY_PREFIX}${account}_${messageId}_${filename}`;
}

/**
 * Read the cache manifest (tracks size + entries for eviction).
 */
async function readManifest() {
  try {
    const record = await db.meta.get(MANIFEST_KEY);
    return record?.value || { totalBytes: 0, entries: [] };
  } catch {
    return { totalBytes: 0, entries: [] };
  }
}

/**
 * Write the cache manifest.
 */
async function writeManifest(manifest) {
  await db.meta.put({ key: MANIFEST_KEY, value: manifest, updatedAt: Date.now() });
}

/**
 * Evict oldest entries until total size is under the limit.
 */
async function evictIfNeeded(manifest, neededBytes) {
  while (manifest.totalBytes + neededBytes > MAX_CACHE_BYTES && manifest.entries.length > 0) {
    const oldest = manifest.entries.shift();
    if (!oldest) break;
    manifest.totalBytes -= oldest.size;
    try {
      await db.meta.delete(oldest.key);
    } catch {
      // Best effort
    }
  }
}

/**
 * Cache an attachment blob.
 *
 * @param {string} messageId - Message API ID
 * @param {string} filename - Attachment filename
 * @param {string} dataUrl - The data URL (data:mime;base64,...) to cache
 * @param {number} size - Approximate size in bytes
 */
export async function cacheAttachmentBlob(messageId, filename, dataUrl, size) {
  if (!messageId || !filename || !dataUrl) return;
  if (size > MAX_SINGLE_BYTES) return; // Skip large attachments

  const account = getAccount();
  const key = blobKey(account, messageId, filename);

  try {
    const manifest = await readManifest();

    // Check if already cached
    if (manifest.entries.some((e) => e.key === key)) return;

    // Evict old entries if needed
    await evictIfNeeded(manifest, size);

    // Store the blob
    await db.meta.put({ key, value: dataUrl, updatedAt: Date.now() });

    // Update manifest
    manifest.entries.push({ key, size, messageId, filename, cachedAt: Date.now() });
    manifest.totalBytes += size;
    await writeManifest(manifest);
  } catch (err) {
    warn('[attachment-cache] Failed to cache attachment', err);
  }
}

/**
 * Retrieve a cached attachment blob.
 *
 * @param {string} messageId - Message API ID
 * @param {string} filename - Attachment filename
 * @returns {Promise<string|null>} The cached data URL, or null
 */
export async function getCachedAttachmentBlob(messageId, filename) {
  if (!messageId || !filename) return null;

  const account = getAccount();
  const key = blobKey(account, messageId, filename);

  try {
    const record = await db.meta.get(key);
    return record?.value || null;
  } catch {
    return null;
  }
}

/**
 * Clear all cached attachment blobs for the current account.
 */
export async function clearAttachmentCache() {
  try {
    const manifest = await readManifest();
    for (const entry of manifest.entries) {
      await db.meta.delete(entry.key).catch(() => {});
    }
    await writeManifest({ totalBytes: 0, entries: [] });
  } catch {
    // Best effort
  }
}
