import { describe, it, expect } from 'vitest';
import {
  normalizeSubject,
  getConversationId,
  groupIntoConversations,
  deduplicateMessages,
} from '../../src/utils/threading';

describe('threading utils', () => {
  it('normalizes subjects by stripping reply/forward prefixes and brackets', () => {
    expect(normalizeSubject('Re: Fwd: [External]  Hello world  ')).toBe('Hello world');
    expect(normalizeSubject('AW:   Test')).toBe('Test');
    expect(normalizeSubject('   ')).toBe('');
  });

  it('uses message headers before subject when generating conversation ids', () => {
    const root = { message_id: '<root@example.com>', subject: 'Topic' };
    const child = { in_reply_to: '<root@example.com>', subject: 'Re: Topic' };
    const fallback = { subject: 'RE: topic' };

    const rootId = getConversationId(root);
    const childId = getConversationId(child);
    const fallbackId = getConversationId(fallback);

    expect(childId).toBe(rootId);
    expect(fallbackId).toBe(rootId);
  });

  it('groups messages into conversations and tracks unread and counts', () => {
    const messages = [
      {
        id: '1',
        message_id: '<1@x>',
        subject: 'Status Update',
        date: '2024-01-01',
        is_unread: true,
      },
      {
        id: '2',
        in_reply_to: '<1@x>',
        subject: 'Re: Status Update',
        date: '2024-01-02',
        is_unread: false,
      },
      {
        id: '3',
        subject: 'Re: Status Update',
        date: '2024-01-03',
        is_unread: false,
      },
      {
        id: '4',
        message_id: '<4@x>',
        subject: 'Different thread',
        date: '2024-01-04',
        is_unread: true,
      },
    ];

    const deduped = deduplicateMessages(messages);
    const conversations = groupIntoConversations(deduped);

    expect(conversations.length).toBe(2);

    const status = conversations.find((c) => c.displaySubject === 'Status Update');
    expect(status?.messages.length).toBe(3);
    expect(status?.hasUnread).toBe(true);
    expect(status?.messageCount).toBe(3);

    const different = conversations.find((c) => c.displaySubject === 'Different thread');
    expect(different?.messages.length).toBe(1);
    expect(different?.hasUnread).toBe(true);
  });
});
