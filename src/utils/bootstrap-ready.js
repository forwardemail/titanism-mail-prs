let resolveReady = null;

export const bootstrapReady = new Promise((resolve) => {
  resolveReady = resolve;
});

export function markBootstrapReady() {
  if (resolveReady) {
    resolveReady();
    resolveReady = null;
  }
}
