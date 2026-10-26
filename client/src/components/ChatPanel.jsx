import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { getSocket } from '../socket';

// Puts messages in time order and removes duplicates (a message can arrive by REST and by socket)
const merge = (current, incoming) => {
  const map = new Map(current.map((m) => [m.id, m]));
  incoming.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
};

export default function ChatPanel({ projectId, archived = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const openRef = useRef(false);
  openRef.current = open;

  const loadLatest = async (initial) => {
    try {
      const data = await api.get(`/projects/${projectId}/messages?limit=50`);
      setMessages((cur) => merge(cur, data.messages));
      if (initial) setHasMore(data.hasMore);
    } catch { /* the panel keeps working with what it has */ }
  };

  const loadOlder = async () => {
    if (messages.length === 0) return;
    try {
      const before = encodeURIComponent(messages[0].created_at);
      const data = await api.get(`/projects/${projectId}/messages?limit=50&before=${before}`);
      setMessages((cur) => merge(cur, data.messages));
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.message);
    }
  };

  // Start fresh for each project
  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setUnread(0);
    loadLatest(true);
  }, [projectId]);

  // Live messages, and a refresh after a reconnect so nothing is missed
  useEffect(() => {
    const socket = getSocket();
    const onMessage = ({ message }) => {
      if (message.project_id !== projectId) return;
      setMessages((cur) => merge(cur, [message]));
      if (!openRef.current && message.user_id !== user.id) setUnread((n) => n + 1);
    };
    const onConnect = () => loadLatest(false);
    socket.on('chat:message', onMessage);
    socket.on('connect', onConnect);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('connect', onConnect);
    };
  }, [projectId, user.id]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // Scroll down only when a newer message appears, not when older ones are loaded
  const newestId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (open && bottomRef.current) bottomRef.current.scrollIntoView({ block: 'end' });
  }, [newestId, open]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const data = await api.post(`/projects/${projectId}/messages`, { body });
      setMessages((cur) => merge(cur, [data.message]));
      setText('');
    } catch (err) {
      setError(err.errors?.map((x) => x.message).join('. ') || err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-30">
      {open && (
        <div className="mb-3 flex h-96 w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <h3 className="font-semibold">Project chat</h3>
            <button onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:text-slate-800">
              Close
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {hasMore && (
              <button onClick={loadOlder} className="block w-full text-center text-xs text-indigo-600 hover:underline">
                Load older messages
              </button>
            )}
            {messages.length === 0 && <p className="text-sm text-slate-500">No messages yet. Say hello.</p>}
            {messages.map((m) => {
              const mine = m.user_id === user.id;
              return (
                <div key={m.id} className={mine ? 'text-right' : 'text-left'}>
                  <div className="text-xs text-slate-500">
                    {mine ? 'You' : m.user_name} {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div
                    className={`inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm ${
                      mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {error && <div className="mx-3 mb-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}

          <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
              placeholder={archived ? 'This project is archived' : 'Write a message...'}
              value={text}
              maxLength={2000}
              disabled={archived}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              disabled={archived || sending || !text.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="relative ml-auto block rounded-full bg-indigo-600 px-5 py-3 font-medium text-white shadow-lg hover:bg-indigo-700"
      >
        Chat
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}