export const LABEL_NAME_PATTERN = /^([A-Za-z\d]|\$)[\w.-]*$/;

export const LABEL_NAME_ERROR =
  'Use letters, digits, _, -, or .; start with a letter, digit, or $. No spaces or punctuation.';

export interface LabelValidationResult {
  ok: boolean;
  value?: string;
  error?: string;
}

export function validateLabelName(name: string | null | undefined): LabelValidationResult {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Name is required.' };
  }
  if (!LABEL_NAME_PATTERN.test(trimmed)) {
    return { ok: false, error: LABEL_NAME_ERROR };
  }
  return { ok: true, value: trimmed };
}
