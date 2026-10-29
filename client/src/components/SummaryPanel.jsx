import { useEffect, useState } from 'react';
import { api } from '../api';

const STATUS = [
  { key: 'todo', label: 'To Do', color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'done', label: 'Done', color: '#10b981' },
];

const PRIORITY = [
  { key: 'high', label: 'High', color: '#ef4444' },
  { key: 'medium', label: 'Medium', color: '#f59e0b' },
  { key: 'low', label: 'Low', color: '#3b82f6' },
];

// Same colors as the type badge on the cards
const TYPES = [
  { key: 'task', label: 'Task', color: '#3b82f6' },
  { key: 'bug', label: 'Bug', color: '#ef4444' },
  { key: 'story', label: 'Story', color: '#10b981' },
];

function StatCard({ value, label, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Donut({ counts, total }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 160 160" className="h-44 w-44 shrink-0" role="img" aria-label="Work items by status">
      <circle cx="80" cy="80" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="18" />
      {total > 0 &&
        STATUS.map((s) => {
          const length = (counts[s.key] / total) * circumference;
          const circle = (
            <circle
              key={s.key}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += length;
          return circle;
        })}
      <text x="80" y="80" textAnchor="middle" className="fill-slate-900 text-3xl font-bold">
        {total}
      </text>
      <text x="80" y="100" textAnchor="middle" className="fill-slate-500 text-xs">
        work items
      </text>
    </svg>
  );
}

function Bar({ label, value, max, color }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="text-slate-500">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function SummaryPanel({ projectId, members }) {
  const [data, setData] = useState(null);
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    const query = assignee ? `?assignee=${assignee}` : '';
    api
      .get(`/projects/${projectId}/summary${query}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [projectId, assignee, reloadKey]);

  if (error) return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
  if (!data) return <p className="text-slate-500">Loading...</p>;

  const maxPriority = Math.max(data.priority.high, data.priority.medium, data.priority.low);
  const types = data.types || { task: 0, bug: 0, story: 0 };
  const maxType = Math.max(types.task, types.bug, types.story);
  const maxLoad = Math.max(...data.workload.map((x) => x.total), data.unassigned);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">
          Show{' '}
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="ml-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Everyone</option>
            {(members || []).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setReloadKey((k) => k + 1)} className="text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
        <span className="text-xs text-slate-400">The filter changes the cards, status, priority and types.</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard value={data.cards.completed} label="completed" hint="in the last 7 days" />
        <StatCard value={data.cards.updated} label="updated" hint="in the last 7 days" />
        <StatCard value={data.cards.created} label="created" hint="in the last 7 days" />
        <StatCard value={data.cards.dueSoon} label="due soon" hint="in the next 7 days" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Status overview</h3>
          <div className="flex items-center gap-6">
            <Donut counts={data.status} total={data.total} />
            <ul className="space-y-1 text-sm">
              {STATUS.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                  {s.label}: {data.status[s.key]}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Priority breakdown</h3>
          {data.total === 0 && <p className="text-sm text-slate-500">No work items yet.</p>}
          {PRIORITY.map((p) => (
            <Bar key={p.key} label={p.label} value={data.priority[p.key]} max={maxPriority} color={p.color} />
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Types of work</h3>
          {data.total === 0 && <p className="text-sm text-slate-500">No work items yet.</p>}
          {TYPES.map((t) => (
            <Bar key={t.key} label={t.label} value={types[t.key]} max={maxType} color={t.color} />
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Work per person</h3>
          {data.workload.length === 0 && data.unassigned === 0 && (
            <p className="text-sm text-slate-500">No work items yet.</p>
          )}
          {data.workload.map((w) => (
            <Bar key={w.user_id} label={`${w.name} (${w.done} of ${w.total} done)`} value={w.total} max={maxLoad} color="#6366f1" />
          ))}
          {data.unassigned > 0 && <Bar label="Unassigned" value={data.unassigned} max={maxLoad} color="#94a3b8" />}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
          <h3 className="mb-3 font-semibold">Recent activity</h3>
          {data.activity.length === 0 && <p className="text-sm text-slate-500">Nothing has happened yet.</p>}
          <ul className="space-y-2">
            {data.activity.map((a) => (
              <li key={a.id} className="text-sm">
                <div className="text-slate-800">{a.text}</div>
                <div className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}