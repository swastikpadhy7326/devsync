const MAX_MENTIONS = 10;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

// text: the comment or chat message
// members: [{ id, name }] for the project's team
// authorId: the person who wrote it (never notified)
// Returns an array of user ids, each at most once, capped at 10.
function findMentionedUserIds(text, members, authorId) {
  if (!text || !Array.isArray(members) || members.length === 0) return [];

  // Longest names first, so "@Meera Patel" wins over "@Meera"
  const candidates = members
    .filter((m) => m.name && m.name.trim())
    .map((m) => ({ id: m.id, name: m.name.trim().toLowerCase() }))
    .sort((a, b) => b.name.length - a.name.length);

  const lower = text.toLowerCase();
  const found = new Set();
  let i = 0;

  while (i < lower.length && found.size < MAX_MENTIONS) {
    if (lower[i] !== '@') {
      i += 1;
      continue;
    }

    // "@" inside a word (like an email address) is not a mention
    const before = i === 0 ? '' : lower[i - 1];
    if (before && WORD_CHAR.test(before)) {
      i += 1;
      continue;
    }

    const rest = lower.slice(i + 1);
    const match = candidates.find((c) => {
      if (!rest.startsWith(c.name)) return false;
      const after = rest[c.name.length];
      // "@Rohan" must not match inside "@Rohania"
      return !after || !WORD_CHAR.test(after);
    });

    if (match) {
      if (match.id !== authorId) found.add(match.id);
      i += 1 + match.name.length;
    } else {
      i += 1;
    }
  }

  return [...found];
}

module.exports = { findMentionedUserIds, MAX_MENTIONS };