const { findMentionedUserIds, MAX_MENTIONS } = require('../src/utils/mentions');

const members = [
  { id: 'u-aarav', name: 'Aarav Sharma' },
  { id: 'u-meera', name: 'Meera' },
  { id: 'u-meera-patel', name: 'Meera Patel' },
  { id: 'u-rohan', name: 'Rohan' },
  { id: 'u-isha', name: 'Isha' },
];

describe('findMentionedUserIds', () => {
  test('finds a member by exact name, ignoring case', () => {
    expect(findMentionedUserIds('hey @rohan please look', members, 'u-aarav')).toEqual(['u-rohan']);
  });

  test('prefers the longest matching name', () => {
    expect(findMentionedUserIds('@Meera Patel can you review?', members, 'u-aarav')).toEqual([
      'u-meera-patel',
    ]);
  });

  test('still matches the shorter name when the longer one is absent', () => {
    expect(findMentionedUserIds('@Meera can you review?', members, 'u-aarav')).toEqual(['u-meera']);
  });

  test('never notifies the author', () => {
    expect(findMentionedUserIds('note to self @Rohan', members, 'u-rohan')).toEqual([]);
  });

  test('ignores people who are not members', () => {
    expect(findMentionedUserIds('@Stranger hello', members, 'u-aarav')).toEqual([]);
  });

  test('ignores @ inside an email address', () => {
    expect(findMentionedUserIds('mail a@rohan.com now', members, 'u-aarav')).toEqual([]);
  });

  test('does not match inside a longer word', () => {
    expect(findMentionedUserIds('@Rohania is not Rohan', members, 'u-aarav')).toEqual([]);
  });

  test('allows punctuation right after the name', () => {
    expect(findMentionedUserIds('thanks @Rohan, and @Isha!', members, 'u-aarav')).toEqual([
      'u-rohan',
      'u-isha',
    ]);
  });

  test('notifies each person only once', () => {
    expect(findMentionedUserIds('@Isha and again @isha', members, 'u-aarav')).toEqual(['u-isha']);
  });

  test('caps the number of people at the limit', () => {
    const many = 'abcdefghijkl'.split('').map((c) => ({ id: `id-${c}`, name: `Member${c}` }));
    const text = many.map((m) => `@${m.name}`).join(' ');
    expect(findMentionedUserIds(text, many, 'someone-else')).toHaveLength(MAX_MENTIONS);
  });

  test('handles empty input safely', () => {
    expect(findMentionedUserIds('', members, 'u-aarav')).toEqual([]);
    expect(findMentionedUserIds(null, members, 'u-aarav')).toEqual([]);
    expect(findMentionedUserIds('@Rohan', [], 'u-aarav')).toEqual([]);
  });
});