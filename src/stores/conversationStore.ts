import { writable, derived } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';
import { debouncedDerived } from '../utils/store-utils.ts';
import { createConversationGrouper } from '../utils/conversation-grouper.js';
import { filteredMessages } from './messageStore';
import { sortOrder } from './viewStore';
import type { Conversation, Message } from '../types';

export const selectedConversationIds: Writable<string[]> = writable([]);
export const selectedConversationCount: Readable<number> = derived(
  selectedConversationIds,
  ($ids) => $ids.length,
);
export const replyTargets: Writable<Set<string>> = writable(new Set());
export const replyMessageIndex: Writable<Map<string, number>> = writable(new Map());

const groupConversations = createConversationGrouper();

export const filteredConversations: Readable<Conversation[]> = debouncedDerived(
  [filteredMessages, sortOrder, replyTargets, replyMessageIndex],
  ([$msgs, $sortOrder, $replyTargets, $replyMessageIndex]: [
    Message[],
    string,
    Set<string>,
    Map<string, number>,
  ]) => groupConversations($msgs, $sortOrder, $replyTargets, $replyMessageIndex),
  [] as Conversation[],
  32,
);
