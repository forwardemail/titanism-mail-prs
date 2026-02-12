/**
 * Folder-related type definitions
 */

export interface Folder {
  id: string;
  account: string;
  name: string;
  path: string;
  delimiter?: string;
  parent?: string | null;
  children?: Folder[];
  specialUse?: SpecialUseFlag;
  flags?: string[];
  subscribed?: boolean;
  unreadCount?: number;
  totalCount?: number;
  uidNext?: number;
  uidValidity?: number;
  modseq?: string | null;
  updatedAt?: number;
}

export type SpecialUseFlag =
  | '\\Inbox'
  | '\\Sent'
  | '\\Drafts'
  | '\\Trash'
  | '\\Junk'
  | '\\Archive'
  | '\\All'
  | '\\Flagged'
  | '\\Important'
  | null;

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
  level: number;
  expanded?: boolean;
}

export interface FolderContextMenuState {
  folder: Folder;
  x: number;
  y: number;
}

export interface FolderOperation {
  type: 'create' | 'rename' | 'delete' | 'move' | 'subscribe' | 'unsubscribe';
  folder: Folder;
  newName?: string;
  targetParent?: string;
}
