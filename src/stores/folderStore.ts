import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { Folder, FolderContextMenuState } from '../types';

export const folders: Writable<Folder[]> = writable([]);
export const selectedFolder: Writable<string> = writable('');
export const expandedFolders: Writable<Set<string>> = writable(new Set());
export const folderContextMenu: Writable<FolderContextMenuState | null> = writable(null);
export const folderOperationInProgress: Writable<boolean> = writable(false);
