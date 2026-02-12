// Lighthouse CI configuration for local/CI usage without external services.
module.exports = {
  ci: {
    collect: {
      // Run against the built static assets; make sure `pnpm build` ran first.
      staticDistDir: './dist',
      numberOfRuns: 2,
      settings: {
        preset: 'desktop',
        formFactor: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouse',
      reportFilenamePattern: 'lighthouse-%%DATETIME%%-%%PATHNAME%%.html',
    },
  },
};
