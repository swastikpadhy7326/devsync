const byNumber = (a, b) => (a.number || 0) - (b.number || 0);

// Splits work items into the backlog (no sprint) and one list per sprint, each in key order
export function groupBySprint(tasks) {
  const backlog = [];
  const bySprint = {};
  tasks.forEach((t) => {
    if (!t.sprint_id) {
      backlog.push(t);
    } else {
      (bySprint[t.sprint_id] = bySprint[t.sprint_id] || []).push(t);
    }
  });
  backlog.sort(byNumber);
  Object.values(bySprint).forEach((list) => list.sort(byNumber));
  return { backlog, bySprint };
}

export function sprintCounts(tasks) {
  const done = tasks.filter((t) => t.status === 'done').length;
  return { total: tasks.length, done, open: tasks.length - done };
}

// Where a work item can go: the backlog (if it is in a sprint) and every planned or active sprint except its own
export function moveTargets(sprints, currentSprintId) {
  const targets = sprints
    .filter((s) => s.status !== 'completed' && s.id !== currentSprintId)
    .map((s) => ({ id: s.id, label: s.status === 'active' ? `${s.name} (active)` : s.name }));
  if (currentSprintId) targets.unshift({ id: null, label: 'Backlog' });
  return targets;
}

export function dateRange(start, end) {
  const s = start ? start.slice(0, 10) : null;
  const e = end ? end.slice(0, 10) : null;
  if (s && e) return `${s} to ${e}`;
  if (s) return `from ${s}`;
  if (e) return `until ${e}`;
  return 'no dates';
}

// Which work items the Board shows: everything, only the active sprint, or only the backlog
export function boardFilter(tasks, mode) {
  if (mode === 'active') return tasks.filter((t) => t.sprint_status === 'active');
  if (mode === 'backlog') return tasks.filter((t) => !t.sprint_id);
  return tasks;
}