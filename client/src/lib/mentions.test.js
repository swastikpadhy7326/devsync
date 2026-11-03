import { describe, expect, test } from 'vitest';
import { applyMention, filterMembers, getMentionQuery, splitMentions } from './mentions';

describe('splitMentions', () => {
  test('marks a known name as a mention', () => {
    expect(splitMentions('hi @Rohan, ok', ['Rohan'])).toEqual([
      { text: 'hi ', mention: false },
      { text: '@Rohan', mention: true },
      { text: ', ok', mention: false },
    ]);
  });

  test('prefers the longest name', () => {
    expect(splitMentions('@Meera Patel hi', ['Meera', 'Meera Patel'])).toEqual([
      { text: '@Meera Patel', mention: true },
      { text: ' hi', mention: false },
    ]);
  });

  test('ignores @ inside an email address', () => {
    expect(splitMentions('a@rohan.com', ['Rohan'])).toEqual([{ text: 'a@rohan.com', mention: false }]);
  });

  test('does not match inside a longer word', () => {
    expect(splitMentions('@Rohania', ['Rohan'])).toEqual([{ text: '@Rohania', mention: false }]);
  });

  test('handles empty text', () => {
    expect(splitMentions('', ['Rohan'])).toEqual([]);
  });
});

describe('getMentionQuery', () => {
  test('finds the text typed after @', () => {
    expect(getMentionQuery('hello @Ro', 9)).toEqual({ start: 6, query: 'Ro' });
  });

  test('an empty query right after @ is allowed', () => {
    expect(getMentionQuery('hi @', 4)).toEqual({ start: 3, query: '' });
  });

  test('returns null when there is no @', () => {
    expect(getMentionQuery('hello', 5)).toBeNull();
  });

  test('returns null for @ inside a word', () => {
    expect(getMentionQuery('a@b', 3)).toBeNull();
  });

  test('returns null when a space follows the @', () => {
    expect(getMentionQuery('hi @ there', 10)).toBeNull();
  });
});

describe('filterMembers', () => {
  const members = [
    { id: '1', name: 'Meera' },
    { id: '2', name: 'Meera Patel' },
    { id: '3', name: 'Rohan' },
  ];

  test('matches names that start with the query, ignoring case', () => {
    expect(filterMembers(members, 'me').map((m) => m.id)).toEqual(['1', '2']);
  });

  test('an empty query lists members up to the limit', () => {
    expect(filterMembers(members, '', 2)).toHaveLength(2);
  });
});

describe('applyMention', () => {
  test('replaces the typed part with the full name and a space', () => {
    expect(applyMention('hi @Ro', 3, 6, 'Rohan')).toEqual({ text: 'hi @Rohan ', caret: 10 });
  });
});