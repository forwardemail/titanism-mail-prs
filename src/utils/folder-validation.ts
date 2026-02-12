const INVALID_FOLDER_CHARS = /[/\\:*?"<>|]/;

export interface FolderValidationResult {
  ok: boolean;
  value?: string;
  error?: string;
}

export const validateFolderName = (name: string | null | undefined): FolderValidationResult => {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Folder name is required' };
  }
  if (INVALID_FOLDER_CHARS.test(trimmed)) {
    return { ok: false, error: 'Folder name contains invalid characters (/ \\ : * ? " < > |)' };
  }
  return { ok: true, value: trimmed };
};
