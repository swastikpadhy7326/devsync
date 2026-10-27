const pad = (n) => String(n).padStart(2, '0');

// A calendar day as YYYY-MM-DD. "month" is 0 to 11, like the JavaScript Date.
export const keyOf = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

export const todayKey = (date = new Date()) => keyOf(date.getFullYear(), date.getMonth(), date.getDate());

// Due dates stay plain YYYY-MM-DD strings, so there are no time zone shifts
export const dueOf = (task) => (task.due_date ? task.due_date.slice(0, 10) : null);

// A finished task is never overdue, and neither is one due today
export const isOverdue = (task, today) => {
  const due = dueOf(task);
  return Boolean(due) && task.status !== 'done' && due < today;
};

const STATUS_ORDER = { todo: 0, in_progress: 1, done: 2 };
const PRIORITY_ORDER = { low: 0, medium: 1, high: 2 };

function compare(key, a, b) {
  switch (key) {
    case 'status':
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case 'priority':
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    case 'assignee':
      return (a.assignee_name || '').localeCompare(b.assignee_name || '');
    default:
      return a.title.localeCompare(b.title);
  }
}

// Filters and sorts a copy of the list. assignee '__none__' means "unassigned".
export function filterAndSortTasks(
  tasks,
  { search = '', status = '', priority = '', assignee = '', sort = { key: 'due', dir: 'asc' } } = {}
) {
  const q = search.trim().toLowerCase();
  const filtered = tasks.filter(
    (t) =>
      (!q || t.title.toLowerCase().includes(q)) &&
      (!status || t.status === status) &&
      (!priority || t.priority === priority) &&
      (!assignee || (assignee === '__none__' ? !t.assignee_name : t.assignee_name === assignee))
  );
  const factor = sort.dir === 'asc' ? 1 : -1;

  return [...filtered].sort((a, b) => {
    if (sort.key === 'due') {
      const da = dueOf(a);
      const db = dueOf(b);
      // Tasks without a due date always go last
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db) * factor;
    }
    return compare(sort.key, a, b) * factor;
  });
}

// Tasks grouped by due day, plus the ones with no due date
export function groupByDay(tasks) {
  const byDay = {};
  const undated = [];
  tasks.forEach((t) => {
    const day = dueOf(t);
    if (!day) {
      undated.push(t);
      return;
    }
    (byDay[day] = byDay[day] || []).push(t);
  });
  return { byDay, undated };
}

// The month grid, Monday first: null for empty cells, then 1..31, padded to whole weeks
export function buildMonthCells(year, month) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}