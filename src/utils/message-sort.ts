import { toDate } from './date.js';
import type { Message, Conversation } from '$types';

type MessageLike = Partial<Message> & Record<string, unknown>;
type ConversationLike = Partial<Conversation> & Record<string, unknown>;

const normalizeSortDate = (value: unknown): number => {
  const parsed = toDate(value as Date | string | number | null | undefined);
  if (!parsed || !Number.isFinite(parsed.getTime())) return 0;
  return parsed.getTime();
};

const normalizeSortUid = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getMessageUidValue = (msg: MessageLike | null | undefined): number | null =>
  normalizeSortUid(msg?.uid ?? msg?.Uid ?? msg?.id ?? msg?.message_id ?? msg?.messageId ?? null);

let lastMessageSortInput: MessageLike[] | null = null;
let lastMessageSortOrder: string | null = null;
let lastMessageSortResult: MessageLike[] | null = null;

export type SortOrder = 'newest' | 'oldest' | 'subject' | 'sender';

const sortMessages = <T extends MessageLike>(list: T[] = [], order: SortOrder = 'newest'): T[] => {
  if (
    lastMessageSortInput === list &&
    lastMessageSortOrder === order &&
    lastMessageSortResult !== null
  ) {
    return lastMessageSortResult as T[];
  }

  const items = Array.isArray(list) ? [...list] : [];
  const dateValue = (msg: MessageLike): number =>
    normalizeSortDate(msg?.dateMs ?? msg?.date ?? msg?.Date);

  const compareByDate = (a: MessageLike, b: MessageLike, direction: number): number => {
    const aDate = dateValue(a);
    const bDate = dateValue(b);
    if (aDate !== bDate) return direction * (aDate - bDate);
    const aUid = getMessageUidValue(a);
    const bUid = getMessageUidValue(b);
    if (aUid != null && bUid != null) return direction * (aUid - bUid);
    if (aUid != null) return -1;
    if (bUid != null) return 1;
    return 0;
  };

  const compareSubject = (a: MessageLike, b: MessageLike): number =>
    ((a.normalizedSubject as string) || (a.subject as string) || '').localeCompare(
      (b.normalizedSubject as string) || (b.subject as string) || '',
      undefined,
      { sensitivity: 'base' },
    );

  const compareSender = (a: MessageLike, b: MessageLike): number =>
    ((a.from as string) || (a.From as string) || '').localeCompare(
      (b.from as string) || (b.From as string) || '',
      undefined,
      { sensitivity: 'base' },
    );

  let sorted: T[];
  switch (order) {
    case 'oldest':
      sorted = items.sort((a, b) => compareByDate(a, b, 1));
      break;
    case 'subject':
      sorted = items.sort((a, b) => {
        const sub = compareSubject(a, b);
        if (sub !== 0) return sub;
        return compareByDate(a, b, -1);
      });
      break;
    case 'sender':
      sorted = items.sort((a, b) => {
        const from = compareSender(a, b);
        if (from !== 0) return from;
        return compareByDate(a, b, -1);
      });
      break;
    case 'newest':
    default:
      sorted = items.sort((a, b) => compareByDate(a, b, -1));
      break;
  }

  lastMessageSortInput = list;
  lastMessageSortOrder = order;
  lastMessageSortResult = sorted;

  return sorted;
};

let lastConvSortInput: ConversationLike[] | null = null;
let lastConvSortOrder: string | null = null;
let lastConvSortResult: ConversationLike[] | null = null;

const sortConversations = <T extends ConversationLike>(
  list: T[] = [],
  order: SortOrder = 'newest',
): T[] => {
  if (lastConvSortInput === list && lastConvSortOrder === order && lastConvSortResult !== null) {
    return lastConvSortResult as T[];
  }

  const items = Array.isArray(list) ? [...list] : [];
  const convDate = (conv: ConversationLike): number =>
    normalizeSortDate(conv?.latestDate ?? conv?.date ?? conv?.Date);
  const convUid = (conv: ConversationLike): number | null =>
    normalizeSortUid(conv?.latestUid ?? conv?.uid ?? conv?.Uid ?? null);

  const compareByDate = (a: ConversationLike, b: ConversationLike, direction: number): number => {
    const aDate = convDate(a);
    const bDate = convDate(b);
    if (aDate !== bDate) return direction * (aDate - bDate);
    const aUid = convUid(a);
    const bUid = convUid(b);
    if (aUid != null && bUid != null) return direction * (aUid - bUid);
    if (aUid != null) return -1;
    if (bUid != null) return 1;
    return 0;
  };

  const compareSubject = (a: ConversationLike, b: ConversationLike): number =>
    ((a.displaySubject as string) || (a.subject as string) || '').localeCompare(
      (b.displaySubject as string) || (b.subject as string) || '',
      undefined,
      { sensitivity: 'base' },
    );

  const compareSender = (a: ConversationLike, b: ConversationLike): number =>
    ((a.latestFrom as string) || '').localeCompare((b.latestFrom as string) || '', undefined, {
      sensitivity: 'base',
    });

  let sorted: T[];
  switch (order) {
    case 'oldest':
      sorted = items.sort((a, b) => compareByDate(a, b, 1));
      break;
    case 'subject':
      sorted = items.sort((a, b) => {
        const sub = compareSubject(a, b);
        if (sub !== 0) return sub;
        return compareByDate(a, b, -1);
      });
      break;
    case 'sender':
      sorted = items.sort((a, b) => {
        const from = compareSender(a, b);
        if (from !== 0) return from;
        return compareByDate(a, b, -1);
      });
      break;
    case 'newest':
    default:
      sorted = items.sort((a, b) => compareByDate(a, b, -1));
      break;
  }

  lastConvSortInput = list;
  lastConvSortOrder = order;
  lastConvSortResult = sorted;

  return sorted;
};

export { normalizeSortDate, normalizeSortUid, getMessageUidValue, sortMessages, sortConversations };
