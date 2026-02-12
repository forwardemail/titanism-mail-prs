import { warn } from './logger.ts';

/**
 * Font loader utility for lazy-loading Fontsource fonts
 * Implements dynamic imports to avoid bundling unused fonts
 */

const FONT_CONFIG = {
  system: {
    name: 'System Default',
    family: 'system-ui, -apple-system, sans-serif',
    import: null, // No import needed
  },
  inter: {
    name: 'Inter',
    family: '"Inter Variable", system-ui, sans-serif',
    import: () => import('@fontsource-variable/inter'),
    weights: null, // Variable font includes all weights
  },
  'open-sans': {
    name: 'Open Sans',
    family: '"Open Sans", system-ui, sans-serif',
    import: () =>
      Promise.all([
        import('@fontsource/open-sans/400.css'),
        import('@fontsource/open-sans/600.css'),
      ]),
    weights: [400, 600],
  },
  merriweather: {
    name: 'Merriweather',
    family: '"Merriweather", Georgia, serif',
    import: () =>
      Promise.all([
        import('@fontsource/merriweather/400.css'),
        import('@fontsource/merriweather/700.css'),
      ]),
    weights: [400, 700],
  },
  literata: {
    name: 'Literata',
    family: '"Literata Variable", Georgia, serif',
    import: () => import('@fontsource-variable/literata'),
    weights: null,
  },
  roboto: {
    name: 'Roboto',
    family: '"Roboto", system-ui, sans-serif',
    import: () =>
      Promise.all([
        import('@fontsource/roboto/400.css'),
        import('@fontsource/roboto/500.css'),
        import('@fontsource/roboto/700.css'),
      ]),
    weights: [400, 500, 700],
  },
};

// Track loaded fonts to prevent duplicate imports
const loadedFonts = new Set();

/**
 * Get list of available fonts for UI
 */
export function getFonts() {
  return Object.entries(FONT_CONFIG).map(([key, config]) => ({
    key,
    name: config.name,
    family: config.family,
  }));
}

/**
 * Load a font dynamically (lazy load)
 * @param {string} fontKey - Font identifier from FONT_CONFIG
 * @returns {Promise<string>} - Returns font-family CSS value
 */
export async function loadFont(fontKey) {
  const config = FONT_CONFIG[fontKey];

  if (!config) {
    warn(`[font-loader] Unknown font: ${fontKey}`);
    return FONT_CONFIG.system.family;
  }

  // System font - no loading needed
  if (!config.import) {
    return config.family;
  }

  // Already loaded
  if (loadedFonts.has(fontKey)) {
    return config.family;
  }

  try {
    // Dynamic import the font CSS
    await config.import();
    loadedFonts.add(fontKey);
    return config.family;
  } catch (error) {
    console.error(`[font-loader] Failed to load font ${fontKey}:`, error);
    // Fallback to system font
    return FONT_CONFIG.system.family;
  }
}

/**
 * Get font family without loading (for UI display)
 */
export function getFontFamily(fontKey) {
  return FONT_CONFIG[fontKey]?.family || FONT_CONFIG.system.family;
}

/**
 * Check if font is loaded
 */
export function isFontLoaded(fontKey) {
  return loadedFonts.has(fontKey) || fontKey === 'system';
}
