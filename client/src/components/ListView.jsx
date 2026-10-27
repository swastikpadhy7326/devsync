import { useMemo, useState } from 'react';

const STATUS_ORDER = { todo: 0, in_progress: 1, done: 2 };
const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const PRIORITY_ORDER = { low: 0, medium: 1, high: 2 };
const PRIORITY_STYLE = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-blue-100 text-blue-700',
};

const COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'due', label: 'Due date' },
];

// Today as YYYY-MM-DD in the person's own time zone
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dueOf = (task) => (task.due_date ? task.due_date.slice(0, 10) : null);

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

export default function ListView({ tasks, onOpen }) {
  const [sort, setSort] = useState({ key: 'due', dir: 'asc' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');

  const assignees = useMemo(
    () => [...new Set(tasks.map((t) => t.assignee_name).filter(Boolean))].sort(),
    [tasks]
  );

  const rows = useMemo(() => {
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
  }, [tasks, search, status, priority, assignee, sort]);

  const clickHeader = (key) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const now = today();
  const selectClass = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          placeholder="Search work items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className={selectClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Everyone</option>
          <option value="__none__">Unassigned</option>
          {assignees.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-4 py-2">
                  <button onClick={() => clickHeader(c.key)} className="font-semibold uppercase hover:text-slate-800">
                    {c.label}
                    {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-slate-500">
                  {tasks.length === 0 ? 'No work items yet.' : 'No work items match these filters.'}
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const due = dueOf(t);
              const overdue = due && t.status !== 'done' && due < now;
              return (
                <tr
                  key={t.id}
                  tabIndex={0}
                  onClick={() => onOpen(t.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t.id); }}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <td className="px-4 py-2 font-medium text-slate-900">{t.title}</td>
                  <td className="px-4 py-2 text-slate-700">{STATUS_LABEL[t.status] || t.status}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLE[t.priority] || ''}`}>{t.priority}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-700">{t.assignee_name || 'Unassigned'}</td>
                  <td className={`px-4 py-2 ${overdue ? 'font-medium text-red-600' : 'text-slate-700'}`}>
                    {due || '-'}{overdue ? ' (overdue)' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Showing {rows.length} of {tasks.length} work items. Click a column to sort, click a row to open it.
      </p>
    </div>
  );
}