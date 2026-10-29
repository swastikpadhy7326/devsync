import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { getSocket } from '../socket';

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';

export default function TaskModal({ taskId, members, onClose, onChanged }) {
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [yourRole, setYourRole] = useState('member');
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(false);
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  const showError = (err) => setError(err.errors?.map((x) => x.message).join('. ') || err.message);

  const loadTask = async () => {
    try {
      const data = await api.get(`/tasks/${taskId}`);
      const t = data.task;
      setYourRole(data.yourRole);
      setForm({
        title: t.title,
        key: t.key,
        type: t.type,
        description: t.description || '',
        priority: t.priority,
        assigneeId: t.assignee_id || '',
        dueDate: t.due_date ? t.due_date.slice(0, 10) : '',
      });
    } catch (err) {
      showError(err);
    }
  };

  const loadComments = async () => {
    try {
      const data = await api.get(`/tasks/${taskId}/comments?limit=100`);
      setComments(data.comments);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadTask(); loadComments(); }, [taskId]);

  // New comments from teammates appear live
  useEffect(() => {
    const socket = getSocket();
    const onComment = (payload) => {
      const id = payload.comment?.task_id ?? payload.taskId;
      if (id === taskId) loadComments();
    };
    socket.on('comment:added', onComment);
    socket.on('comment:deleted', onComment);
    return () => {
      socket.off('comment:added', onComment);
      socket.off('comment:deleted', onComment);
    };
  }, [taskId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  useEffect(() => {
    api.get('/ai/status').then((d) => setAiEnabled(d.enabled)).catch(() => {});
  }, []);

  const summarize = async () => {
    setSummarizing(true);
    setSummary('');
    setError('');
    try {
      const data = await api.post(`/tasks/${taskId}/summary`);
      setSummary(data.summary);
    } catch (err) {
      showError(err);
    } finally {
      setSummarizing(false);
    }
  };


  

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/tasks/${taskId}`, {
        title: form.title,
        description: form.description || null,
        priority: form.priority,
                type: form.type,
        assigneeId: form.assigneeId || null,
        dueDate: form.dueDate || null,
      });
      onChanged();
      onClose();
    } catch (err) {
      showError(err);
    } finally {
      setSaving(false);
    }
  };

  const removeTask = async () => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      onChanged();
      onClose();
    } catch (err) {
      showError(err);
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${taskId}/comments`, { body: newComment });
      setNewComment('');
      await loadComments();
    } catch (err) {
      showError(err);
    }
  };

  const removeComment = async (id) => {
    try {
      await api.delete(`/comments/${id}`);
      await loadComments();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
                   <h2 className="text-lg font-semibold">
            Task details
            {form?.key ? <span className="ml-2 text-sm font-normal text-slate-500">{form.key}</span> : null}
          </h2> 
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800" aria-label="Close">✕</button>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {!form ? (
          !error && <p className="text-slate-500">Loading...</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <label className="block text-sm font-medium">
              Title
              <input className={`${input} mt-1`} value={form.title} onChange={update('title')} required />
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea className={`${input} mt-1`} rows={4} value={form.description} onChange={update('description')} />
            </label>
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="block text-sm font-medium">
                Priority
                <select className={`${input} mt-1`} value={form.priority} onChange={update('priority')}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Assignee
                <select className={`${input} mt-1`} value={form.assigneeId} onChange={update('assigneeId')}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Due date
                <input type="date" className={`${input} mt-1`} value={form.dueDate} onChange={update('dueDate')} />
              </label>
                            <label className="block text-sm font-medium">
                Type
                <select className={`${input} mt-1`} value={form.type} onChange={update('type')}>
                  <option value="task">Task</option>
                  <option value="bug">Bug</option>
                  <option value="story">Story</option>
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={removeTask} className="text-sm text-red-600 hover:underline">Delete task</button>
              <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        )}

        <hr className="my-6 border-slate-200" />

               <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Comments ({comments.length})</h3>
          {aiEnabled && (
            <button type="button" onClick={summarize} disabled={summarizing} className="rounded-lg border border-indigo-200 px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-60">
              {summarizing ? 'Summarizing...' : 'Summarize with AI'}
            </button>
          )}
        </div>
        {summary && (
          <div className="mb-4 whitespace-pre-wrap rounded-lg bg-indigo-50 px-3 py-2 text-sm text-slate-700">
            <div className="mb-1 text-xs font-semibold uppercase text-indigo-600">AI summary (can be wrong)</div>
            {summary}
          </div>
        )}
        <div className="mb-4 space-y-3">
          {comments.length === 0 && <p className="text-sm text-slate-500">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span><strong className="text-slate-700">{c.user_name}</strong> · {new Date(c.created_at).toLocaleString()}</span>
                {(c.user_id === user.id || yourRole !== 'member') && (
                  <button onClick={() => removeComment(c.id)} className="text-red-600 hover:underline">Delete</button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          ))}
        </div>

        <form onSubmit={addComment} className="flex gap-2">
          <input className={`${input} flex-1`} placeholder="Write a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)} />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">Send</button>
        </form>
      </div>
    </div>
  );
}