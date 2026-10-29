import { describe, expect, test } from 'vitest';
import { dateRange, groupBySprint, moveTargets, sprintCounts } from './sprints';

const task = (over) => ({ id: over.title, title: 'Untitled', status: 'todo', number: 1, sprint_id: null, ...over });
const keys = (list) => list.map((t) => t.title);

describe('groupBySprint', () => {
  test('puts work without a sprint in the backlog and the rest under their sprint', () => {
    const tasks = [
      task({ title: 'A', number: 1 }),
      task({ title: 'B', number: 2, sprint_id: 's1' }),
      task({ title: 'C', number: 3, sprint_id: 's2' }),
      task({ title: 'D', number: 4, sprint_id: 's1' }),
    ];
    const { backlog, bySprint } = groupBySprint(tasks);

    expect(keys(backlog)).toEqual(['A']);
    expect(keys(bySprint.s1)).toEqual(['B', 'D']);
    expect(keys(bySprint.s2)).toEqual(['C']);
  });

  test('sorts each group by issue number, not by text', () => {
    const tasks = [
      task({ title: 'ten', number: 10 }),
      task({ title: 'two', number: 2 }),
      task({ title: 'one', number: 1 }),
    ];
    expect(keys(groupBySprint(tasks).backlog)).toEqual(['one', 'two', 'ten']);
  });

  test('handles an empty list', () => {
    expect(groupBySprint([])).toEqual({ backlog: [], bySprint: {} });
  });

  test('does not change the list it was given', () => {
    const tasks = [task({ title: 'b', number: 2 }), task({ title: 'a', number: 1 })];
    groupBySprint(tasks);
    expect(keys(tasks)).toEqual(['b', 'a']);
  });
});

describe('sprintCounts', () => {
  test('counts total, done and open work', () => {
    const list = [task({ status: 'done' }), task({ status: 'in_progress' }), task({ status: 'todo' }), task({ status: 'done' })];
    expect(sprintCounts(list)).toEqual({ total: 4, done: 2, open: 2 });
  });

  test('an empty sprint has zeros', () => {
    expect(sprintCounts([])).toEqual({ total: 0, done: 0, open: 0 });
  });
});

describe('moveTargets', () => {
  const sprints = [
    { id: 'a', name: 'Active one', status: 'active' },
    { id: 'p', name: 'Planned one', status: 'planned' },
    { id: 'c', name: 'Old one', status: 'completed' },
  ];

  test('a backlog item can go to any planned or active sprint, never a completed one', () => {
    expect(moveTargets(sprints, null)).toEqual([
      { id: 'a', label: 'Active one (active)' },
      { id: 'p', label: 'Planned one' },
    ]);
  });

  test('an item in a sprint can go back to the backlog or to another open sprint, but not to its own', () => {
    expect(moveTargets(sprints, 'a')).toEqual([
      { id: null, label: 'Backlog' },
      { id: 'p', label: 'Planned one' },
    ]);
  });

  test('with no sprints, a backlog item has nowhere to go', () => {
    expect(moveTargets([], null)).toEqual([]);
  });
});

describe('dateRange', () => {
  test('shows both dates, one date, or a placeholder', () => {
    expect(dateRange('2026-11-02', '2026-11-15')).toBe('2026-11-02 to 2026-11-15');
    expect(dateRange('2026-11-02', null)).toBe('from 2026-11-02');
    expect(dateRange(null, '2026-11-15')).toBe('until 2026-11-15');
    expect(dateRange(null, null)).toBe('no dates');
  });

  test('cuts full timestamps down to the date', () => {
    expect(dateRange('2026-11-02T00:00:00.000Z', '2026-11-15T00:00:00.000Z')).toBe('2026-11-02 to 2026-11-15');
  });
});