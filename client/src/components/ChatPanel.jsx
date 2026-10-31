import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { getSocket } from '../socket';
import { prepareFile } from '../lib/images';
import AttachmentView from './AttachmentView';

const EPOCH = '1970-01-01T00:00:00.000Z';
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';

// Puts messages in time order and removes duplicates (a message can arrive by REST and by socket)
const merge = (current, incoming) => {
  const map = new Map(current.map((m) => [m.id, m]));
  incoming.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
};

export default function ChatPanel({ projectId, archived = false }) {
  const { user } = useAuth();
  const seenKey = `devsync_chat_seen_${user.id}_${projectId}`;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [preview, setPreview] = useState(null);

  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const openRef = useRef(false);
  const previewTimer = useRef(null);
  const baseTitle = useRef(document.title);
  openRef.current = open;

  const readSeen = () => {
    try { return localStorage.getItem(seenKey); } catch { return null; }
  };
  const saveSeen = (value) => {
    setLastSeen(value);
    try { localStorage.setItem(seenKey, value); } catch { /* storage can be blocked */ }
  };

  const loadLatest = async (initial) => {
    try {
      const data = await api.get(`/projects/${projectId}/messages?limit=50`);
      setMessages((cur) => merge(cur, data.messages));
      if (initial) {
        setHasMore(data.hasMore);
        const stored = readSeen();
        if (stored) {
          setLastSeen(stored);
        } else {
          // First visit: everything already in the chat counts as seen
          const newest = data.messages[data.messages.length - 1];
          saveSeen(newest ? newest.created_at : EPOCH);
        }
      }
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
    setLastSeen(null);
    setPreview(null);
    loadLatest(true);
  }, [projectId]);

  // Live messages, plus refreshes so a missed event never leaves the chat out of date
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => loadLatest(false);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onMessage = ({ message }) => {
      if (message.project_id !== projectId) return;
      setMessages((cur) => merge(cur, [message]));
      if (!openRef.current && message.user_id !== user.id) {
        setPreview(message);
        clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(() => setPreview(null), 6000);
      }
    };

    socket.on('chat:message', onMessage);
    socket.on('connect', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('connect', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(previewTimer.current);
    };
  }, [projectId, user.id]);

  // Opening the panel refreshes it
  useEffect(() => {
    if (open) loadLatest(false);
  }, [open]);

  // Unread = messages from other people that are newer than the last time this panel was open
  const unread =
    lastSeen === null
      ? 0
      : messages.filter((m) => m.user_id !== user.id && new Date(m.created_at) > new Date(lastSeen)).length;

  // While the panel is open, everything on screen counts as seen
  const newestAt = messages.length ? messages[messages.length - 1].created_at : null;
  useEffect(() => {
    if (open && newestAt && (lastSeen === null || new Date(newestAt) > new Date(lastSeen))) {
      saveSeen(newestAt);
    }
  }, [open, newestAt]);

  // The browser tab shows the unread count, like "(2) DevSync"
  useEffect(() => {
    const base = baseTitle.current;
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => { document.title = base; };
  }, [unread]);

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

  // A photo or PDF, with whatever is typed in the box as its caption
  const pickFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || sending) return;
    setSending(true);
    setError('');
    try {
      const { blob, name, type } = await prepareFile(file);
      const caption = text.trim();
      const headers = { 'Content-Type': type, 'X-Filename': encodeURIComponent(name) };
      if (caption) headers['X-Caption'] = encodeURIComponent(caption);
      const data = await api.upload(`/projects/${projectId}/messages/file`, blob, headers);
      setMessages((cur) => merge(cur, [data.message]));
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const openPanel = () => {
    setPreview(null);
    setOpen(true);
  };

  // The new tab is opened first, inside the click, so browsers do not block it as a popup
  const startMeeting = async () => {
    setError('');
    const win = window.open('about:blank', '_blank');
    try {
      const data = await api.get(`/projects/${projectId}/meeting`);
      if (win) {
        win.opener = null;
        win.location.href = data.url;
      } else {
        setError('Your browser blocked the new tab. Allow pop-ups for this site and try again.');
      }
    } catch (err) {
      if (win) win.close();
      setError(err.message);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end">
      {open && (
        <div className="mb-3 flex h-96 w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <h3 className="font-semibold">Project chat</h3>
            <button onClick={startMeeting} className="rounded-lg border border-indigo-200 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
              Start meeting
            </button>
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
                  {m.attachment_id && (
                    <div className="mb-1">
                      <AttachmentView id={m.attachment_id} name={m.attachment_name} type={m.attachment_type} size={m.attachment_size} />
                    </div>
                  )}
                  {m.body && (
                    <div
                      className={`inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm ${
                        mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {m.body}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {error && <div className="mx-3 mb-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}

          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={pickFile} />
            <button
              type="button"
              title="Attach a photo or a PDF"
              aria-label="Attach a photo or a PDF"
              disabled={archived || sending}
              onClick={() => fileRef.current && fileRef.current.click()}
              className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
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

      {!open && preview && (
        <button
          onClick={openPanel}
          className="mb-2 block w-72 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-lg"
        >
          <div className="text-xs font-semibold text-indigo-600">{preview.user_name}</div>
          <div className="truncate text-sm text-slate-700">
            {preview.body || `Sent a file: ${preview.attachment_name || ''}`}
          </div>
        </button>
      )}

      <button
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="relative block rounded-full bg-indigo-600 px-5 py-3 font-medium text-white shadow-lg hover:bg-indigo-700"
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