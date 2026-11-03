const WORD_CHAR = /[\p{L}\p{N}_]/u;

// Splits text into pieces for display: [{ text, mention: true | false }]
// names: the names of the project's team members
export function splitMentions(text, names) {
  if (!text) return [];
  const candidates = [...new Set((names || []).map((n) => n && n.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  const lower = text.toLowerCase();
  const parts = [];
  let plainStart = 0;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '@' || (i > 0 && WORD_CHAR.test(text[i - 1]))) {
      i += 1;
      continue;
    }
    const rest = lower.slice(i + 1);
    const match = candidates.find((name) => {
      const n = name.toLowerCase();
      if (!rest.startsWith(n)) return false;
      const after = rest[n.length];
      return !after || !WORD_CHAR.test(after);
    });
    if (!match) {
      i += 1;
      continue;
    }
    if (i > plainStart) parts.push({ text: text.slice(plainStart, i), mention: false });
    const end = i + 1 + match.length;
    parts.push({ text: text.slice(i, end), mention: true });
    plainStart = end;
    i = end;
  }

  if (plainStart < text.length) parts.push({ text: text.slice(plainStart), mention: false });
  return parts;
}

// If the cursor is right after "@something", returns { start, query }, otherwise null
export function getMentionQuery(text, caret) {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && WORD_CHAR.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || query.includes('\n') || query.startsWith(' ')) return null;
  return { start: at, query };
}

// Members whose name starts with what was typed after "@"
export function filterMembers(members, query, limit = 5) {
  const q = query.toLowerCase();
  return members
    .filter((m) => m.name && m.name.toLowerCase().startsWith(q))
    .slice(0, limit);
}

// Replaces "@que" with "@Full Name " and says where the cursor should go
export function applyMention(text, start, caret, name) {
  const inserted = `@${name} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length,
  };
}
