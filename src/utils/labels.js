export const LABEL_PALETTE = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#0ea5e9',
  '#f97316',
];

export const pickLabelColor = (index = 0, palette = LABEL_PALETTE) => {
  if (!palette.length) return '';
  return palette[index % palette.length];
};
