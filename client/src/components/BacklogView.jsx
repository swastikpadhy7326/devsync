import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { getSocket } from '../socket';
import { dateRange, groupBySprint, moveTargets, sprintCounts } from '../lib/sprints';
import TypeBadge from './TypeBadge';
import BurndownChart from './BurndownChart';

const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const SPRINT_BADGE = {
  active: 'bg-emerald-100 text-emerald-700',
  planned: 'bg-slate-200 text-slate-600',
  completed: 'bg-indigo-100 text-indigo-700',
};

function TaskRow({ task, sprints, canMove, onOpen, onMove }) {
  const targets = moveTargets(sprints, task.sprint_id);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0">
      <TypeBadge type={task.type} showLabel={false} />
      <span className="w-16 shrink-0 text-slate-500">{task.key}</span>
      <button onClick={() => onOpen(task.id)} className="min-w-0 flex-1 truncate text-left font-medium text-slate-900 hover:underline">
        {task.title}
      </button>
      <span className="text-xs text-slate-500">{STATUS_LABEL[task.status] || task.status}</span>
      <span className="w-28 truncate text-xs text-slate-500">{task.assignee_name || 'Unassigned'}</span>
      {canMove && targets.length > 0 && (
        <select
          value=""
          onChange={(e) => onMove(task, e.target.value)}
          className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
        >
          <option value="">Move to...</option>
          {targets.map((t) => (
            <option key={t.id ?? 'backlog'} value={t.id ?? 'backlog'}>{t.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function BacklogView({ projectId, tasks, onOpen, onChanged, archived = false }) {
  const [sprints, setSprints] = useState([]);
  const [role, setRole] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });

  const load = async () => {
    try {
      const data = await api.get(`/projects/${projectId}/sprints`);
      setSprints(data.sprints);
      setRole(data.yourRole || null);
    } catch (err) {
      setError(err.message);
    }
  };

  // Load the sprints, and reload them when a teammate changes one
  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('sprint:changed', load);
    return () => socket.off('sprint:changed', load);
  }, [projectId]);

  const groups = useMemo(() => groupBySprint(tasks), [tasks]);
  const canManage = !archived && (role === 'owner' || role === 'admin');
  const canMove = !archived;

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      setError(err.errors?.map((x) => x.message).join('. ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const createSprint = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const body = { name };
    if (form.startDate) body.startDate = form.startDate;
    if (form.endDate) body.endDate = form.endDate;
    run(async () => {
      await api.post(`/projects/${projectId}/sprints`, body);
      setForm({ name: '', startDate: '', endDate: '' });
    });
  };

  const startSprint = (s) => run(() => api.post(`/sprints/${s.id}/start`));

  const completeSprint = (s) => {
    const open = sprintCounts(groups.bySprint[s.id] || []).open;
    const note = open > 0 ? ` ${open} unfinished work item(s) will go back to the backlog.` : '';
    if (!window.confirm(`Complete "${s.name}"?${note}`)) return;
    run(() => api.post(`/sprints/${s.id}/complete`));
  };

  const deleteSprint = (s) => {
    if (!window.confirm(`Delete "${s.name}"? Its work items go back to the backlog.`)) return;
    run(() => api.delete(`/sprints/${s.id}`));
  };

  const moveTask = (task, value) => {
    if (!value) return;
    run(() => api.patch(`/tasks/${task.id}`, { sprintId: value === 'backlog' ? null : value }));
  };

  const openSprints = sprints.filter((s) => s.status !== 'completed');
  const finished = sprints.filter((s) => s.status === 'completed');
  const btn = 'rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-60';

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {canManage && (
        <form onSubmit={createSprint} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <label className="text-xs font-medium text-slate-600">
            New sprint
            <input
              className="mt-1 block w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Sprint name"
              value={form.name}
              maxLength={100}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Start
            <input type="date" className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            End
            <input type="date" className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </label>
          <button disabled={busy || !form.name.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            Create sprint
          </button>
        </form>
      )}

      {openSprints.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          {canManage ? 'No sprints yet. Create one above, then move work items into it.' : 'No sprints yet. An owner or admin can create one.'}
        </p>
      )}

      {openSprints.map((s) => {
        const list = groups.bySprint[s.id] || [];
        const counts = sprintCounts(list);
        return (
          <section key={s.id} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
              <h3 className="font-semibold">{s.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs ${SPRINT_BADGE[s.status]}`}>{s.status}</span>
              <span className="text-xs text-slate-500">{dateRange(s.start_date, s.end_date)}</span>
              <span className="text-xs text-slate-500">{counts.done} of {counts.total} done</span>
              <div className="ml-auto flex gap-2">
                {canManage && s.status === 'planned' && (
                  <>
                    <button disabled={busy} onClick={() => startSprint(s)} className={`${btn} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>Start sprint</button>
                    <button disabled={busy} onClick={() => deleteSprint(s)} className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}>Delete</button>
                  </>
                )}
                {canManage && s.status === 'active' && (
                  <button disabled={busy} onClick={() => completeSprint(s)} className={`${btn} border-indigo-300 text-indigo-700 hover:bg-indigo-50`}>Complete sprint</button>
                )}
              </div>
            </div>
                    {s.status === 'active' && (
              <BurndownChart sprintId={s.id} signature={list.map((t) => `${t.id}:${t.status}`).join(',')} />
            )}
            {s.goal && <p className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-600">Goal: {s.goal}</p>}
            {list.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">No work items in this sprint. Use "Move to..." on a backlog item.</p>
            ) : (
              list.map((t) => <TaskRow key={t.id} task={t} sprints={sprints} canMove={canMove} onOpen={onOpen} onMove={moveTask} />)
            )}
          </section>
        );
      })}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
          <h3 className="font-semibold">Backlog</h3>
          <span className="text-xs text-slate-500">{groups.backlog.length} work items</span>
        </div>
        {groups.backlog.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-500">The backlog is empty.</p>
        ) : (
          groups.backlog.map((t) => <TaskRow key={t.id} task={t} sprints={sprints} canMove={canMove} onOpen={onOpen} onMove={moveTask} />)
        )}
      </section>

      {finished.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 font-semibold">Completed sprints</h3>
          <ul className="space-y-1 text-sm">
            {finished.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-slate-700">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-slate-500">{dateRange(s.start_date, s.end_date)}</span>
                <span className="text-xs text-slate-500">{sprintCounts(groups.bySprint[s.id] || []).done} work items finished</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}