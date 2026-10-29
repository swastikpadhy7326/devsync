import { describe, expect, test } from 'vitest';
import { buildMonthCells, dueOf, filterAndSortTasks, groupByDay, isOverdue, keyOf, todayKey } from './tasks';

const task = (over) => ({
  id: over.title,
  title: 'Untitled',
  status: 'todo',
  priority: 'medium',
  assignee_name: null,
  due_date: null,
  ...over,
});

const titles = (list) => list.map((t) => t.title);

describe('dates', () => {
  test('keyOf pads the month and the day and counts months from 0', () => {
    expect(keyOf(2026, 0, 5)).toBe('2026-01-05');
    expect(keyOf(2026, 9, 27)).toBe('2026-10-27');
  });

  test('todayKey uses the local calendar day', () => {
    expect(todayKey(new Date(2026, 9, 27))).toBe('2026-10-27');
    expect(todayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  test('dueOf keeps only the date part and returns null when there is none', () => {
    expect(dueOf(task({ due_date: '2026-11-05' }))).toBe('2026-11-05');
    expect(dueOf(task({ due_date: '2026-11-05T00:00:00.000Z' }))).toBe('2026-11-05');
    expect(dueOf(task({ due_date: null }))).toBeNull();
  });
});

describe('isOverdue', () => {
  const today = '2026-10-27';

  test('a past due date on unfinished work is overdue', () => {
    expect(isOverdue(task({ due_date: '2026-10-26' }), today)).toBe(true);
    expect(isOverdue(task({ due_date: '2026-10-26', status: 'in_progress' }), today)).toBe(true);
  });

  test('today and the future are not overdue', () => {
    expect(isOverdue(task({ due_date: '2026-10-27' }), today)).toBe(false);
    expect(isOverdue(task({ due_date: '2026-10-28' }), today)).toBe(false);
  });

  test('a finished task is never overdue', () => {
    expect(isOverdue(task({ due_date: '2026-01-01', status: 'done' }), today)).toBe(false);
  });

  test('a task with no due date is not overdue', () => {
    expect(isOverdue(task({}), today)).toBe(false);
  });
});

describe('filterAndSortTasks', () => {
  const tasks = [
    task({ title: 'Beta', status: 'todo', priority: 'high', assignee_name: 'Zed', due_date: '2026-11-05' }),
    task({ title: 'alpha', status: 'in_progress', priority: 'low', assignee_name: 'Asha', due_date: '2026-10-01' }),
    task({ title: 'Gamma', status: 'done', priority: 'medium', assignee_name: null, due_date: null }),
    task({ title: 'Delta', status: 'todo', priority: 'low', assignee_name: 'Asha', due_date: '2026-12-24' }),
    task({ title: 'Echo', status: 'done', priority: 'high', assignee_name: null, due_date: null }),
  ];

  test('search ignores case and spaces around the text', () => {
    expect(titles(filterAndSortTasks(tasks, { search: '  ALPHA ', sort: { key: 'title', dir: 'asc' } }))).toEqual(['alpha']);
    expect(titles(filterAndSortTasks(tasks, { search: 'a', sort: { key: 'title', dir: 'asc' } }))).toEqual([
      'alpha',
      'Beta',
      'Delta',
      'Gamma',
    ]);
  });

  test('filters by status and by priority', () => {
    expect(titles(filterAndSortTasks(tasks, { status: 'todo', sort: { key: 'title', dir: 'asc' } }))).toEqual(['Beta', 'Delta']);
    expect(titles(filterAndSortTasks(tasks, { priority: 'high', sort: { key: 'title', dir: 'asc' } }))).toEqual(['Beta', 'Echo']);
  });

  test('filters by assignee and by "unassigned"', () => {
    expect(titles(filterAndSortTasks(tasks, { assignee: 'Asha', sort: { key: 'title', dir: 'asc' } }))).toEqual(['alpha', 'Delta']);
    expect(titles(filterAndSortTasks(tasks, { assignee: '__none__', sort: { key: 'title', dir: 'asc' } }))).toEqual(['Echo', 'Gamma']);
  });

  test('combines several filters', () => {
    const result = filterAndSortTasks(tasks, { status: 'todo', assignee: 'Asha', priority: 'low' });
    expect(titles(result)).toEqual(['Delta']);
  });

  test('returns an empty list when nothing matches', () => {
    expect(filterAndSortTasks(tasks, { search: 'nothing like this' })).toEqual([]);
  });

  test('sorts by title in both directions, ignoring case', () => {
    expect(titles(filterAndSortTasks(tasks, { sort: { key: 'title', dir: 'asc' } }))).toEqual(['alpha', 'Beta', 'Delta', 'Echo', 'Gamma']);
    expect(titles(filterAndSortTasks(tasks, { sort: { key: 'title', dir: 'desc' } }))).toEqual(['Gamma', 'Echo', 'Delta', 'Beta', 'alpha']);
  });

  test('sorts by due date and always puts tasks without one last', () => {
    const asc = filterAndSortTasks(tasks, { sort: { key: 'due', dir: 'asc' } });
    const desc = filterAndSortTasks(tasks, { sort: { key: 'due', dir: 'desc' } });

    expect(titles(asc).slice(0, 3)).toEqual(['alpha', 'Beta', 'Delta']);
    expect(titles(desc).slice(0, 3)).toEqual(['Delta', 'Beta', 'alpha']);
    expect(titles(asc).slice(3).sort()).toEqual(['Echo', 'Gamma']);
    expect(titles(desc).slice(3).sort()).toEqual(['Echo', 'Gamma']);
  });

  test('sorts by status in board order and by priority from low to high', () => {
    const byStatus = filterAndSortTasks(tasks, { sort: { key: 'status', dir: 'asc' } });
    expect(byStatus.map((t) => t.status)).toEqual(['todo', 'todo', 'in_progress', 'done', 'done']);

    const byPriority = filterAndSortTasks(tasks, { sort: { key: 'priority', dir: 'asc' } });
    expect(byPriority.map((t) => t.priority)).toEqual(['low', 'low', 'medium', 'high', 'high']);
    const reversed = filterAndSortTasks(tasks, { sort: { key: 'priority', dir: 'desc' } });
    expect(reversed.map((t) => t.priority)).toEqual(['high', 'high', 'medium', 'low', 'low']);
  });

  test('sorts by assignee name, with unassigned first when ascending', () => {
    const asc = filterAndSortTasks(tasks, { sort: { key: 'assignee', dir: 'asc' } });
    expect(asc.map((t) => t.assignee_name || '')).toEqual(['', '', 'Asha', 'Asha', 'Zed']);
  });

  test('does not change the list it was given', () => {
    const before = titles(tasks);
    filterAndSortTasks(tasks, { sort: { key: 'title', dir: 'desc' } });
    expect(titles(tasks)).toEqual(before);
  });
});

describe('groupByDay', () => {
  test('groups tasks by due day and keeps the undated ones apart', () => {
    const a = task({ title: 'A', due_date: '2026-10-27' });
    const b = task({ title: 'B', due_date: '2026-10-27T00:00:00.000Z' });
    const c = task({ title: 'C', due_date: '2026-10-28' });
    const d = task({ title: 'D', due_date: null });

    const { byDay, undated } = groupByDay([a, b, c, d]);

    expect(Object.keys(byDay).sort()).toEqual(['2026-10-27', '2026-10-28']);
    expect(titles(byDay['2026-10-27'])).toEqual(['A', 'B']);
    expect(titles(byDay['2026-10-28'])).toEqual(['C']);
    expect(titles(undated)).toEqual(['D']);
  });

  test('handles an empty list', () => {
    expect(groupByDay([])).toEqual({ byDay: {}, undated: [] });
  });
});

describe('buildMonthCells', () => {
  const days = (cells) => cells.filter((c) => c !== null);

  test('October 2026 starts on a Thursday, so three empty cells come first', () => {
    const cells = buildMonthCells(2026, 9);
    expect(cells).toHaveLength(35);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]).toBe(1);
    expect(cells[33]).toBe(31);
    expect(cells[34]).toBeNull();
  });

  test('February 2027 starts on a Monday and fills exactly four weeks', () => {
    const cells = buildMonthCells(2027, 1);
    expect(cells).toHaveLength(28);
    expect(cells[0]).toBe(1);
    expect(cells[27]).toBe(28);
    expect(cells.includes(null)).toBe(false);
  });

  test('February 2026 starts on a Sunday, so the first week has six empty cells', () => {
    const cells = buildMonthCells(2026, 1);
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toBe(1);
    expect(days(cells)).toHaveLength(28);
  });

  test('leap year: February 2028 has 29 days', () => {
    expect(days(buildMonthCells(2028, 1))).toHaveLength(29);
    expect(days(buildMonthCells(2027, 1))).toHaveLength(28);
  });

  test('the grid always holds whole weeks and the days in order', () => {
    for (let month = 0; month < 12; month += 1) {
      const cells = buildMonthCells(2026, month);
      expect(cells.length % 7).toBe(0);
      expect(days(cells)).toEqual([...Array(days(cells).length).keys()].map((i) => i + 1));
    }
  });
});

describe('keys and types', () => {
  const tasks = [
    task({ title: 'Login crash', key: 'DEV-2', number: 2, type: 'bug' }),
    task({ title: 'Reset password flow', key: 'DEV-10', number: 10, type: 'story' }),
    task({ title: 'Write docs', key: 'DEV-1', number: 1, type: 'task' }),
    task({ title: 'Dark mode', key: 'DEV-3', number: 3, type: 'story' }),
  ];
  const byTitle = { key: 'title', dir: 'asc' };

  test('the search also matches the key, ignoring case', () => {
    expect(titles(filterAndSortTasks(tasks, { search: 'dev-10', sort: byTitle }))).toEqual(['Reset password flow']);
  });

  test('a short key search matches every key that contains it', () => {
    expect(titles(filterAndSortTasks(tasks, { search: 'DEV-1', sort: byTitle }))).toEqual([
      'Reset password flow',
      'Write docs',
    ]);
  });

  test('filters by type, alone and together with other filters', () => {
    expect(titles(filterAndSortTasks(tasks, { type: 'story', sort: byTitle }))).toEqual(['Dark mode', 'Reset password flow']);
    expect(titles(filterAndSortTasks(tasks, { type: 'bug', sort: byTitle }))).toEqual(['Login crash']);

    const mixed = [...tasks, task({ title: 'Story that is done', type: 'story', status: 'done', key: 'DEV-4', number: 4 })];
    expect(titles(filterAndSortTasks(mixed, { type: 'story', status: 'done', sort: byTitle }))).toEqual(['Story that is done']);
  });

  test('sorts by key in number order, not text order', () => {
    const asc = filterAndSortTasks(tasks, { sort: { key: 'key', dir: 'asc' } });
    expect(asc.map((t) => t.key)).toEqual(['DEV-1', 'DEV-2', 'DEV-3', 'DEV-10']);
    const desc = filterAndSortTasks(tasks, { sort: { key: 'key', dir: 'desc' } });
    expect(desc.map((t) => t.key)).toEqual(['DEV-10', 'DEV-3', 'DEV-2', 'DEV-1']);
  });

  test('sorts by type from task to bug to story, keeping the original order inside a type', () => {
    const asc = filterAndSortTasks(tasks, { sort: { key: 'type', dir: 'asc' } });
    expect(titles(asc)).toEqual(['Write docs', 'Login crash', 'Reset password flow', 'Dark mode']);
    const desc = filterAndSortTasks(tasks, { sort: { key: 'type', dir: 'desc' } });
    expect(titles(desc)).toEqual(['Reset password flow', 'Dark mode', 'Login crash', 'Write docs']);
  });
});