export const truncatePreview = (text, maxLength = 50) => {
  if (!text) return '';
  const str = String(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength).trim() + '...';
};
