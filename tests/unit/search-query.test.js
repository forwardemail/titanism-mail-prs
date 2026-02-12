import { describe, it, expect } from 'vitest';
import { parseSearchQuery, applySearchFilters } from '../../src/utils/search-query.js';

describe('search-query', () => {
  it('parses operators and builds filters', () => {
    const { text, filters, ast } = parseSearchQuery(
      'from:alice subject:invoice has:attachment is:unread before:2024-01-01',
    );

    expect(text).toBe('');
    expect(filters.from).toEqual(['alice']);
    expect(filters.subject).toEqual(['invoice']);
    expect(filters.hasAttachment).toBe(true);
    expect(filters.isUnread).toBe(true);
    expect(filters.before).toBeGreaterThan(0);
    expect(ast).toBeTruthy();
  });

  it('supports boolean logic and labels in AST evaluation', () => {
    const query = '(from:alice OR from:bob) AND label:work AND NOT is:read';
    const parsed = parseSearchQuery(query);
    const messages = [
      { id: 1, from: 'Alice <a@example.com>', labels: ['work'], is_unread: true },
      { id: 2, from: 'Bob <b@example.com>', labels: ['personal'], is_unread: true },
      { id: 3, from: 'Eve <e@example.com>', labels: ['work'], is_unread: true },
      { id: 4, from: 'Alice <a@example.com>', labels: ['work'], is_unread: false },
    ];

    const results = applySearchFilters(messages, parsed.filters);
    expect(parsed.filters.ast).toBeTruthy();
    expect(applySearchFilters([messages[0]], parsed.filters).length).toBe(1);
    expect(results.map((m) => m.id)).toEqual([1]);
  });

  it('applies size and folder filters with in:all bypass', () => {
    const parsed = parseSearchQuery('size:>1024 in:all');
    const messages = [
      { id: 1, size: 2048, folder: 'INBOX', is_unread: false },
      { id: 2, size: 512, folder: 'Archive', is_unread: false },
      { id: 3, size: 4096, folder: 'Archive', is_unread: true },
    ];

    const results = applySearchFilters(messages, parsed.filters);
    expect(results.map((m) => m.id)).toEqual([1, 3]);
  });

  it('matches phrase text through AST when quoted', () => {
    const parsed = parseSearchQuery('("quarterly report")');
    const messages = [
      { id: 1, subject: 'Quarterly Report Q1', from: 'ceo@example.com', snippet: '' },
      { id: 2, subject: 'Monthly report', from: 'ceo@example.com', snippet: '' },
    ];

    const results = applySearchFilters(messages, parsed.filters);
    expect(results.map((m) => m.id)).toEqual([1]);
  });
});
