import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext, DragOverlay, PointerSensor, closestCorners,
  useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { api } from '../api';
import { getSocket } from '../socket';
import Layout from '../components/Layout';
import TaskModal from '../components/TaskModal';
import ChatPanel from '../components/ChatPanel';
import SummaryPanel from '../components/SummaryPanel';
import ListView from '../components/ListView';
import BacklogView from '../components/BacklogView';
import CalendarView from '../components/CalendarView';
import TypeBadge from '../components/TypeBadge';

const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

const PRIORITY = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-200 text-slate-600',
};

function CardBody({ task }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
        <TypeBadge type={task.type} showLabel={false} />
        <span>{task.key}</span>
      </div>
      <div className="text-sm font-medium">{task.title}</div>  
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 ${PRIORITY[task.priority]}`}>{task.priority}</span>
        <span className="text-slate-500">
          {task.due_date && <span className="mr-2">{task.due_date.slice(0, 10)}</span>}
          {task.assignee_name}
        </span>
      </div>
    </div>
  );
}

// A card is both draggable and a drop target, so we know where it lands
function TaskCard({ task, onOpen }) {
  const drag = useDraggable({ id: task.id });
  const drop = useDroppable({ id: task.id });
  const ref = (node) => {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
  };

  return (
    <div
      ref={ref}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => onOpen(task.id)}
      className={`cursor-grab touch-none ${drag.isDragging ? 'opacity-40' : ''}`}
    >
      <CardBody task={task} />
    </div>
  );
}

function Column({ column, tasks, onOpen, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [title, setTitle] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle('');
    await onAdd(column.id, value);
  };

  return (
    <div ref={setNodeRef} className={`rounded-xl p-3 ${isOver ? 'bg-indigo-50' : 'bg-slate-100'}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{column.title}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{tasks.length}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2">
        {tasks.map((t) => <TaskCard key={t.id} task={t} onOpen={onOpen} />)}
      </div>
      <form onSubmit={submit} className="mt-3">
        <input
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
          placeholder="+ Add a task"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </form>
    </div>
  );
}

export default function BoardPage() {
  const { projectId } = useParams();
  const [params, setParams] = useSearchParams();
  const openTaskId = params.get('task');

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [board, setBoard] = useState(null);
  const [online, setOnline] = useState([]);
  const [error, setError] = useState('');
  const [activeTask, setActiveTask] = useState(null);

  const suppressClick = useRef(false);
  const timer = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadBoard = useCallback(async () => {
    try {
      const data = await api.get(`/projects/${projectId}/board`);
      setBoard(data.board);
    } catch (err) {
      setError(err.message);
    }
  }, [projectId]);

  // Several events can arrive at once, so reload only once
  const scheduleLoad = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(loadBoard, 150);
  }, [loadBoard]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Project details, team members, and the board
  useEffect(() => {
    (async () => {
      try {
        const p = await api.get(`/projects/${projectId}`);
        setProject(p.project);
        const t = await api.get(`/teams/${p.project.team_id}`);
        setMembers(t.members);
      } catch (err) {
        setError(err.message);
      }
    })();
    loadBoard();
  }, [projectId, loadBoard]);

  // Live updates
  useEffect(() => {
    const socket = getSocket();
    const events = ['task:created', 'task:updated', 'task:moved', 'task:deleted', 'sprint:changed'];

    const join = () =>
      socket.emit('project:join', projectId, (res) => {
        if (res?.ok) setOnline(res.online);
        scheduleLoad(); // catch up on anything missed while disconnected
      });
    const onPresence = (p) => { if (p.projectId === projectId) setOnline(p.users); };

    events.forEach((e) => socket.on(e, scheduleLoad));
    socket.on('presence:update', onPresence);
    socket.on('connect', join);
    if (socket.connected) join();
    else socket.connect();

    return () => {
      socket.emit('project:leave', projectId);
      socket.off('connect', join);
      socket.off('presence:update', onPresence);
      events.forEach((e) => socket.off(e, scheduleLoad));
    };
  }, [projectId, scheduleLoad]);

    const [view, setView] = useState('board');
  const allTasks = board ? [...board.todo, ...board.in_progress, ...board.done] : [];
  const findTask = (id) => allTasks.find((t) => t.id === id);

  const openTask = (id) => {
    if (!suppressClick.current) setParams({ task: id });
  };
  const closeTask = useCallback(() => setParams({}), [setParams]);

  const addTask = async (status, title) => {
    setError('');
    try {
      await api.post(`/projects/${projectId}/tasks`, { title, status });
      await loadBoard();
    } catch (err) {
      setError(err.errors?.map((x) => x.message).join('. ') || err.message);
    }
  };

  const onDragStart = ({ active }) => setActiveTask(findTask(active.id));

  const onDragEnd = async ({ active, over }) => {
    setActiveTask(null);
    // A drop can trigger a click on the card, which we ignore
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);

    if (!over || !board) return;
    const task = findTask(active.id);
    if (!task || active.id === over.id) return;

    let toStatus;
    let toIndex;
    if (COLUMNS.some((c) => c.id === over.id)) {
      // Dropped on a column: goes to the bottom
      toStatus = over.id;
      toIndex = board[toStatus].filter((t) => t.id !== task.id).length;
    } else {
      const overTask = findTask(over.id);
      if (!overTask) return;
      toStatus = overTask.status;
      const without = board[toStatus].filter((t) => t.id !== task.id);
      toIndex = without.findIndex((t) => t.id === overTask.id);
      const fromIndex = board[task.status].findIndex((t) => t.id === task.id);
      const overIndex = board[toStatus].findIndex((t) => t.id === overTask.id);
      // Dragging downwards inside a column lands after the card you dropped on
      if (task.status === toStatus && fromIndex < overIndex) toIndex += 1;
    }

    // Update the screen immediately, then tell the server
    const next = { todo: [...board.todo], in_progress: [...board.in_progress], done: [...board.done] };
    next[task.status] = next[task.status].filter((t) => t.id !== task.id);
    next[toStatus].splice(toIndex, 0, { ...task, status: toStatus });
    for (const key of Object.keys(next)) {
      next[key] = next[key].map((t, i) => ({ ...t, position: i }));
    }
    setBoard(next);

    try {
      await api.patch(`/tasks/${task.id}/move`, { status: toStatus, position: toIndex });
    } catch (err) {
      setError(err.message);
      loadBoard();
    }
  };

  return (
    <Layout wide>
      <Link to={project ? `/teams/${project.team_id}` : '/'} className="text-sm text-indigo-600">← Back to team</Link>

      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{project ? project.name : 'Board'}</h2>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Online:</span>
          {online.length === 0 && <span>just you</span>}
          {online.map((u) => (
            <span
              key={u.id}
              title={u.name}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
            >
              {u.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
      </div>

            <div className="mb-4 flex gap-2">
        {[['board', 'Board'], ['list', 'List'], ['backlog', 'Backlog'], ['calendar', 'Calendar'], ['summary', 'Summary']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              view === key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {project?.is_archived && (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This project is archived. It is read-only.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className={view === 'board' ? '' : 'hidden'}>
      {!board ? (
        !error && <p className="text-slate-500">Loading...</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {COLUMNS.map((c) => (
              <Column key={c.id} column={c} tasks={board[c.id]} onOpen={openTask} onAdd={addTask} />
            ))}
          </div>
          <DragOverlay>{activeTask ? <CardBody task={activeTask} /> : null}</DragOverlay>
        </DndContext>
      )}

            </div>
                  {view === 'calendar' && board && <CalendarView tasks={allTasks} onOpen={openTask} />}
                  {view === 'backlog' && board && <BacklogView projectId={projectId} tasks={allTasks} onOpen={openTask} onChanged={scheduleLoad} archived={Boolean(project?.is_archived)} />}
            {view === 'list' && board && <ListView tasks={allTasks} onOpen={openTask} />}
      {view === 'summary' && <SummaryPanel projectId={projectId} members={members} />}
      {openTaskId && (
        <TaskModal taskId={openTaskId} members={members} onClose={closeTask} onChanged={scheduleLoad} />
      )}
          <ChatPanel projectId={projectId} archived={Boolean(project?.is_archived)} />
    </Layout>
  );
}