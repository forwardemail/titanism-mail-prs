/**
 * Service Worker Cache Management Utilities
 *
 * NOTE: We only cache static assets (JS, CSS, images) in the service worker.
 * API responses and email data are cached in IndexedDB instead, which provides
 * better account isolation and more control over data lifecycle.
 */

/**
 * Clear all service worker caches
 * Called on full logout (no remaining accounts)
 * This only clears static assets (JS, CSS, HTML, images, fonts)
 */
export async function clearAllSWCaches() {
  if (!('caches' in window)) {
    return;
  }

  try {
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames.map(async (cacheName) => {
        const deleted = await caches.delete(cacheName);
        return deleted;
      }),
    );
  } catch (error) {
    console.error('[SW Cache] Error clearing caches:', error);
  }
}

/**
 * Unregister the service worker completely
 * Nuclear option - removes SW and clears all caches
 */
export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.all(
      registrations.map(async (registration) => {
        const unregistered = await registration.unregister();
        return unregistered;
      }),
    );

    // Also clear all caches
    await clearAllSWCaches();
  } catch (error) {
    console.error('[SW] Error unregistering service worker:', error);
  }
}

/**
 * Get current cache usage statistics
 * Useful for monitoring and debugging
 */
export async function getCacheStats() {
  if (!('caches' in window)) {
    return { supported: false };
  }

  try {
    const cacheNames = await caches.keys();
    const stats = {
      supported: true,
      cacheCount: cacheNames.length,
      cacheNames: cacheNames,
      details: [],
    };

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      stats.details.push({
        name: cacheName,
        entryCount: keys.length,
      });
    }

    return stats;
  } catch (error) {
    console.error('[SW Cache] Error getting cache stats:', error);
    return { supported: true, error: error.message };
  }
}
